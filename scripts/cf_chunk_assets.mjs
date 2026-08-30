#!/usr/bin/env node
/**
 * Cloudflare ↔ this origin stalls mid-body above ~16–19 KiB.
 * Split built JS/CSS into ≤14 KiB parts; boot loader fetches all parts in parallel.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const ASSETS = join(DIST, "assets");
/** Verified safe through CF orange-cloud on exchange.hackme.tech (Aug 2026). */
const MAX = 14 * 1024;

function byteLen(s) {
  return Buffer.byteLength(s, "utf8");
}

function hardSlice(s) {
  const out = [];
  let buf = Buffer.from(s, "utf8");
  while (buf.length > MAX) {
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

function buildLoader(partUrls) {
  const list = JSON.stringify(partUrls);
  const loader = `(async()=>{const P=${list};const C=await Promise.all(P.map(async u=>{let e;for(let a=1;a<=3;a++){try{const r=await fetch(u);if(!r.ok)throw new Error(r.status);return await r.text()}catch(x){e=x;await new Promise(t=>setTimeout(t,60*a))}}throw new Error(u+" "+e)}));await import(URL.createObjectURL(new Blob([C.join("")],{type:"text/javascript"})))})().catch(e=>{console.error(e);const el=document.createElement("pre");el.style.cssText="padding:24px;color:#f88;font:14px/1.4 monospace";el.textContent="Boot failed: "+e;document.body.appendChild(el)});`;
  if (byteLen(loader) > MAX) {
    console.error(`loader too large: ${byteLen(loader)} (max ${MAX})`);
    process.exit(1);
  }
  return loader;
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

  const manifestName = `boot-${tag}.json`;
  const loaderBody = buildLoader(jsPartUrls);
  const loaderName = `boot-${tag}-${createHash("sha256").update(`${MAX}:${jsParts.length}:${loaderBody}`).digest("hex").slice(0, 8)}.js`;
  writeFileSync(join(ASSETS, manifestName), JSON.stringify(jsPartUrls));
  writeFileSync(join(ASSETS, loaderName), loaderBody);

  let html = readFileSync(join(DIST, "index.html"), "utf8");
  html = html.replace(
    /<link rel="stylesheet"[^>]*href="\/assets\/index-[^"]+\.css"[^>]*>/,
    cssHrefs.map((h) => `<link rel="stylesheet" crossorigin href="${h}">`).join("\n    "),
  );
  html = html.replace(
    /<script type="module"[^>]*src="\/assets\/index-[^"]+\.js"[^>]*><\/script>/,
    `<link rel="modulepreload" crossorigin href="/assets/${loaderName}">\n    <script type="module" crossorigin src="/assets/${loaderName}"></script>`,
  );
  if (!/script-src 'self' blob:/.test(html)) {
    html = html.replace(/script-src 'self'/g, "script-src 'self' blob:");
  }
  writeFileSync(join(DIST, "index.html"), html);

  unlinkSync(join(ASSETS, jsName));
  unlinkSync(join(ASSETS, cssName));

  const sizes = readdirSync(ASSETS, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => [d.name, readFileSync(join(ASSETS, d.name)).length])
    .filter(([, n]) => n > MAX);
  if (sizes.length) {
    console.error("oversized assets:", sizes);
    process.exit(1);
  }
  console.log(
    `cf_chunk_assets: js=${jsParts.length} parts css=${cssParts.length} parts loader=${byteLen(readFileSync(join(ASSETS, loaderName), "utf8"))}B tag=${tag}`,
  );
}

main();
