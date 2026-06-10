import { getStore } from "@netlify/blobs";
import { scanIntervals } from "./lib/market-scanner.mjs";

const ALL_INTERVALS = ["5m", "15m", "1h", "4h", "1d", "1w"];

function dueIntervals(now, hasPreviousData) {
  if (!hasPreviousData) return ALL_INTERVALS;
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const due = [];
  if (minute % 5 === 0) due.push("5m");
  if (minute % 15 === 0) due.push("15m");
  if (minute === 0) due.push("1h");
  if (minute === 0 && hour % 4 === 0) due.push("4h");
  if (minute === 0 && hour === 0) due.push("1d");
  if (minute === 0 && hour === 0 && day === 1) due.push("1w");
  return due;
}

export default async () => {
  const store = getStore("supertrend-results");
  const previous = await store.get("latest", { type: "json", consistency: "strong" });
  const now = new Date();
  const due = dueIntervals(now, Boolean(previous));
  if (due.length === 0) {
    return new Response(JSON.stringify({ ok: true, scanned: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  const fresh = await scanIntervals(due);
  const intervals = { ...(previous?.intervals || {}) };
  for (const interval of due) {
    intervals[interval] = {
      scannedAt: now.toISOString(),
      events: fresh.intervals[interval],
    };
  }
  const state = {
    generatedAt: now.toISOString(),
    settings: { limit: fresh.marketCount, atrPeriod: 10, multiplier: 3 },
    intervals,
  };
  await store.setJSON("latest", state);
  return new Response(JSON.stringify({
    ok: true,
    scanned: due,
    marketCount: fresh.marketCount,
  }), {
    headers: { "content-type": "application/json" },
  });
};
