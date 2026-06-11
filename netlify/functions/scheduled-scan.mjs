import { getStore } from "@netlify/blobs";
import { scanIntervals } from "./lib/market-scanner.mjs";

const ALL_INTERVALS = ["5m", "15m", "1h", "4h", "1d", "1w"];

function eventKey(event) {
  return `${event.symbol}:${event.signal}:${event.candleCloseTime}`;
}

function onlyNewEvents(previousEvents = [], freshEvents = []) {
  const previousKeys = new Set(previousEvents.map(eventKey));
  return freshEvents.filter((event) => !previousKeys.has(eventKey(event)));
}

function telegramMessage(interval, events) {
  const buys = events.filter((event) => event.signal === "YENI AL");
  const sells = events.filter((event) => event.signal === "YENI SAT");
  const scannedAt = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
  });
  const lines = [
    "SadecePara Supertrend Sinyali",
    `Zaman dilimi: ${interval}`,
    `Tarama saati: ${scannedAt}`,
  ];
  if (buys.length) {
    lines.push(
      "",
      `🟢 YENİ AL (${buys.length})`,
      ...buys.map((event) => `• ${event.symbol.replace(/USDT$/, "/USDT")}`),
    );
  }
  if (sells.length) {
    lines.push(
      "",
      `🔴 YENİ SAT (${sells.length})`,
      ...sells.map((event) => `• ${event.symbol.replace(/USDT$/, "/USDT")}`),
    );
  }
  lines.push(
    "",
    "Detaylı tablo:",
    "https://sadecepara.com",
    "",
    "Bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.",
  );
  return lines.join("\n");
}

async function sendTelegram(interval, events) {
  const token = Netlify.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Netlify.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId || events.length === 0) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: telegramMessage(interval, events),
      disable_web_page_preview: true,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram error: ${result.description || response.status}`);
  }
}

function dueIntervals(now, hasPreviousData) {
  if (!hasPreviousData) return ALL_INTERVALS;
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const due = [];
  // Spread scans across separate minutes so 415 markets do not create a
  // large request burst when several candles close at the same time.
  if (minute % 5 === 1) due.push("5m");
  if (minute % 15 === 2) due.push("15m");
  if (minute === 3) due.push("1h");
  if (minute === 4 && hour % 4 === 0) due.push("4h");
  if (minute === 5 && hour === 0) due.push("1d");
  if (minute === 6 && hour === 0 && day === 1) due.push("1w");
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
  const notifications = [];
  for (const interval of due) {
    const freshEvents = fresh.intervals[interval];
    const newEvents = previous
      ? onlyNewEvents(previous.intervals?.[interval]?.events, freshEvents)
      : [];
    intervals[interval] = {
      scannedAt: now.toISOString(),
      events: freshEvents,
    };
    if (newEvents.length) notifications.push(sendTelegram(interval, newEvents));
  }
  const state = {
    generatedAt: now.toISOString(),
    settings: { limit: fresh.marketCount, atrPeriod: 10, multiplier: 3 },
    intervals,
  };
  await store.setJSON("latest", state);
  await Promise.all(notifications);
  return new Response(JSON.stringify({
    ok: true,
    scanned: due,
    marketCount: fresh.marketCount,
  }), {
    headers: { "content-type": "application/json" },
  });
};
