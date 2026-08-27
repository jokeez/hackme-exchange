#!/usr/bin/env node
/**
 * Cloudflare ↔ this origin stalls mid-body above ~16–19 KiB.
 * Split built JS/CSS into ≤12 KiB parts so orange-cloud delivery works.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const ASSETS = join(DIST, "assets");
/** Stay under CF stall threshold (~16–19 KiB on this origin). */
const MAX = 10 * 1024;

function byteLen(s) {
  return Buffer.byteLength(s, "utf8");
}

function hardSlice(s) {
  const out = [];
  let buf = Buffer.from(s, "utf8");
  while (buf.length > MAX) {
    // Split on UTF-8 boundary: walk back from MAX if mid-codepoint.
    let n = MAX;
    while (n > 0 && (buf[n] & 0xc0) === 0x80) n--;
    if (n === 0) n = MAX;
    out.push(buf.subarray(0, n).toString("utf8"));
    buf = buf.subarray(n);
  }
  if (buf.length) out.push(buf.toString("utf8"));
  return out;
}

function splitCss(css) {
  const parts = [];
  let buf = "";
  for (const chunk of css.split(/(?<=\})/)) {
    if (byteLen(buf) + byteLen(chunk) > MAX && buf) {
      parts.push(buf);
      buf = chunk;
    } else {
      buf += chunk;
    }
  }
  if (buf) parts.push(buf);
  return parts.flatMap((p) => (byteLen(p) <= MAX ? [p] : hardSlice(p)));
}

function splitJs(js) {
  return hardSlice(js);
}

function main() {
  const files = readdirSync(ASSETS);
  const jsName = files.find((f) => /^index-.*\.js$/.test(f));
  const cssName = files.find((f) => /^index-.*\.css$/.test(f));
  if (!jsName || !cssName) {
    console.error("cf_chunk_assets: missing index-*.js/css in dist/assets");
    process.exit(1);
  }

  const js = readFileSync(join(ASSETS, jsName), "utf8");
  const css = readFileSync(join(ASSETS, cssName), "utf8");
  const tag = jsName.replace(/^index-/, "").replace(/\.js$/, "");

  const cssParts = splitCss(css);
  const jsParts = splitJs(js);

  const cssHrefs = [];
  cssParts.forEach((part, i) => {
    const name = `css-${tag}-${String(i).padStart(3, "0")}.css`;
    writeFileSync(join(ASSETS, name), part);
    cssHrefs.push(`/assets/${name}`);
  });

  const jsPartUrls = [];
  jsParts.forEach((part, i) => {
    const name = `js-${tag}-${String(i).padStart(3, "0")}.part`;
    writeFileSync(join(ASSETS, name), part);
    jsPartUrls.push(`/assets/${name}`);
  });

  const loaderName = `boot-${tag}.js`;
  // Keep loader tiny: part URLs live in a sidecar JSON under MAX.
  const manifestName = `boot-${tag}.json`;
  writeFileSync(join(ASSETS, manifestName), JSON.stringify(jsPartUrls));
  const loader = `(async()=>{
  const parts=await(await fetch("/assets/${manifestName}",{cache:"no-store"})).json();
  let code="";
  for(const u of parts){
    let last;
    for(let a=1;a<=4;a++){
      try{
        const r=await fetch(u,{cache:"no-store"});
        if(!r.ok) throw new Error(r.status);
        code+=await r.text();
        last=null; break;
      }catch(e){ last=e; await new Promise(r=>setTimeout(r,120*a)); }
    }
    if(last) throw new Error("chunk "+u+" "+last);
  }
  await import(URL.createObjectURL(new Blob([code],{type:"text/javascript"})));
})().catch((e)=>{console.error(e);const el=document.createElement("pre");el.style.cssText="padding:24px;color:#f88;font:14px/1.4 monospace";el.textContent="Boot failed: "+e;document.body.appendChild(el);});
`;
  if (byteLen(loader) > MAX || byteLen(JSON.stringify(jsPartUrls)) > MAX) {
    console.error(`loader/manifest too large: loader=${byteLen(loader)} manifest=${byteLen(JSON.stringify(jsPartUrls))}`);
    process.exit(1);
  }
  writeFileSync(join(ASSETS, loaderName), loader);

  let html = readFileSync(join(DIST, "index.html"), "utf8");
  html = html.replace(
    /<link rel="stylesheet"[^>]*href="\/assets\/index-[^"]+\.css"[^>]*>/,
    cssHrefs.map((h) => `<link rel="stylesheet" crossorigin href="${h}">`).join("\n    "),
  );
  html = html.replace(
    /<script type="module"[^>]*src="\/assets\/index-[^"]+\.js"[^>]*><\/script>/,
    `<script type="module" crossorigin src="/assets/${loaderName}"></script>`,
  );
  // Idempotent: allow blob: module import for reconstituted bundle.
  if (!/script-src 'self' blob:/.test(html)) {
    html = html.replace(/script-src 'self'/g, "script-src 'self' blob:");
  }
  writeFileSync(join(DIST, "index.html"), html);

  unlinkSync(join(ASSETS, jsName));
  unlinkSync(join(ASSETS, cssName));

  const sizes = readdirSync(ASSETS)
    .map((f) => [f, readFileSync(join(ASSETS, f)).length])
    .filter(([, n]) => n > MAX);
  if (sizes.length) {
    console.error("oversized assets:", sizes);
    process.exit(1);
  }
  console.log(
    `cf_chunk_assets: js=${jsParts.length} parts css=${cssParts.length} parts loader=${byteLen(loader)}B tag=${tag}`,
  );
}

main();
