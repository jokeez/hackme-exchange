import type { DemoState } from "../types";
import { formatNum, formatPrice } from "../market";
import { pairById } from "../pairs";

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportOrdersCsv(state: DemoState): string {
  const header = "id,pair,side,type,status,amount_base,price,quote,filled_base,created_at";
  const rows = state.orders.map((o) => {
    const p = pairById(o.pairId);
    const quote = o.price > 0 ? o.price * o.amountBase : "";
    return [
      o.id,
      p.label,
      o.side,
      o.kind,
      o.status,
      formatNum(o.amountBase, 6),
      o.price > 0 ? formatPrice(o.price) : "",
      quote !== "" ? formatNum(quote, 4) : "",
      formatNum(o.filledBase, 6),
      new Date(o.createdAt).toISOString(),
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header, ...rows].join("\n");
}

export function exportFillsCsv(state: DemoState): string {
  const header = "id,pair,side,amount_base,price,amount_quote,fee_quote,ts";
  const rows = state.trades.map((t) => {
    const p = pairById(t.pairId);
    return [
      t.id,
      p.label,
      t.side,
      formatNum(t.amountBase, 6),
      formatPrice(t.price),
      formatNum(t.amountQuote, 4),
      formatNum(t.feeQuote, 6),
      new Date(t.ts).toISOString(),
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header, ...rows].join("\n");
}

export function exportOrdersFilename(kind: "orders" | "fills"): string {
  const d = new Date().toISOString().slice(0, 10);
  return `hackme-exchange-${kind}-${d}.csv`;
}
