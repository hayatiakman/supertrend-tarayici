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

function telegramPreferences() {
  const signals = (Netlify.env.get("TELEGRAM_SIGNALS") || "AL,SAT")
    .split(",").map((value) => value.trim().toUpperCase());
  const intervals = (Netlify.env.get("TELEGRAM_INTERVALS") || ALL_INTERVALS.join(","))
    .split(",").map((value) => value.trim());
  const minVolume = Number(Netlify.env.get("TELEGRAM_MIN_VOLUME") || 0);
  return { signals, intervals, minVolume };
}

function filterTelegramEvents(interval, events) {
  const preferences = telegramPreferences();
  if (!preferences.intervals.includes(interval)) return [];
  return events.filter((event) => {
    const direction = event.signal === "YENI AL" ? "AL" : "SAT";
    return preferences.signals.includes(direction)
      && event.quoteVolume >= preferences.minVolume;
  });
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
    "https://sadecepara.com/?utm_source=telegram&utm_medium=social&utm_campaign=signals",
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

function updateHistory(previousHistory, newEvents, interval, prices, now) {
  const cutoff = now.getTime() - 24 * 60 * 60_000;
  const history = (previousHistory || [])
    .filter((item) => new Date(item.detectedAt).getTime() >= cutoff);
  const known = new Set(history.map((item) =>
    `${item.symbol}:${item.signal}:${item.interval}:${item.candleCloseTime}`));

  for (const event of newEvents) {
    const key = `${event.symbol}:${event.signal}:${interval}:${event.candleCloseTime}`;
    if (!known.has(key)) {
      history.push({
        ...event,
        interval,
        detectedAt: now.toISOString(),
        entryPrice: event.price,
      });
      known.add(key);
    }
  }

  return history.map((item) => {
    const currentPrice = prices[item.symbol] ?? item.currentPrice ?? item.entryPrice;
    const rawChangePercent = ((currentPrice - item.entryPrice) / item.entryPrice) * 100;
    return {
      ...item,
      currentPrice,
      rawChangePercent,
      performancePercent: item.signal === "YENI AL"
        ? rawChangePercent
        : -rawChangePercent,
    };
  }).sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
}

function dueIntervals(now, previous) {
  if (!previous) return ["5m"];
  const missingInterval = ALL_INTERVALS.find((interval) => !previous.states?.[interval]);
  if (missingInterval) return [missingInterval];
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
  const due = dueIntervals(now, previous);
  if (due.length === 0) {
    return new Response(JSON.stringify({ ok: true, scanned: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  const fresh = await scanIntervals(due);
  const intervals = { ...(previous?.intervals || {}) };
  const states = { ...(previous?.states || {}) };
  const notifications = [];
  let history = previous?.history || [];
  for (const interval of due) {
    const freshEvents = fresh.intervals[interval];
    const newEvents = previous
      ? onlyNewEvents(previous.intervals?.[interval]?.events, freshEvents)
      : [];
    intervals[interval] = {
      scannedAt: now.toISOString(),
      events: freshEvents,
    };
    states[interval] = {
      scannedAt: now.toISOString(),
      markets: fresh.states[interval],
    };
    history = updateHistory(history, newEvents, interval, fresh.marketPrices, now);
    const telegramEvents = filterTelegramEvents(interval, newEvents);
    if (telegramEvents.length) notifications.push(sendTelegram(interval, telegramEvents));
  }
  const state = {
    generatedAt: now.toISOString(),
    settings: { limit: fresh.marketCount, atrPeriod: 10, multiplier: 3 },
    markets: fresh.markets,
    intervals,
    states,
    history,
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
