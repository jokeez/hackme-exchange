import type { Candle, Timeframe } from "./types";
import { TF_SEC } from "./types";

export function candleCountdown(tf: Timeframe, now = Date.now()): string {
  const sec = TF_SEC[tf];
  const nowSec = Math.floor(now / 1000);
  const left = sec - (nowSec % sec);
  const m = Math.floor(left / 60);
  const s = left % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Approx yesterday close from candle history (24h ago bar close). */
export function yesterdayClose(candles: Candle[]): number | undefined {
  if (candles.length < 2) return undefined;
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  let best: Candle | undefined;
  for (const c of sorted) {
    if (c.time <= cutoff) best = c;
    else break;
  }
  return best?.close ?? sorted[Math.max(0, sorted.length - 2)]?.close;
}

export function playAlertBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, peak = 0.04) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(start);
      o.stop(start + dur + 0.02);
    };
    // Soft two-note chime (C5 → E5), quieter than the old 880 Hz blip.
    tone(523.25, now, 0.2, 0.035);
    tone(659.25, now + 0.16, 0.26, 0.028);
    setTimeout(() => {
      void ctx.close();
    }, 650);
  } catch {
    /* ignore */
  }
}

export async function fireBrowserAlert(title: string, body: string): Promise<void> {
  playAlertBeep();
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body, silent: true });
  }
}
