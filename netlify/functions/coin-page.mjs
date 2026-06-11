import { getStore } from "@netlify/blobs";
import {
  INTERVALS, displaySymbol, escapeHtml, liveTradesPanel, pageShell, symbolSlug, tradingViewUrl,
} from "./lib/page-helpers.mjs";

function formatPrice(value) {
  return Number(value).toLocaleString("en-US", { maximumSignificantDigits: 8 });
}

export default async (request) => {
  const requestUrl = new URL(request.url);
  const requested = decodeURIComponent(requestUrl.searchParams.get("symbol") || "")
    .replaceAll("/", "").toLocaleLowerCase("en-US");
  const store = getStore("supertrend-results");
  const data = await store.get("latest", { type: "json", consistency: "strong" });
  if (!data) return new Response("Veri hazırlanıyor.", { status: 503 });

  const symbols = data.markets || [];
  const symbol = symbols.find((item) => symbolSlug(item) === requested);
  if (!symbol) return new Response("Parite bulunamadı.", { status: 404 });

  const base = symbol.replace(/USDT$/, "");
  const states = INTERVALS.map((interval) => {
    const group = data.states?.[interval];
    const state = group?.markets?.find((item) => item.symbol === symbol);
    return { interval, scannedAt: group?.scannedAt, state };
  });
  const latest = states.find(({ state }) => state)?.state;
  const history = (data.history || []).filter((item) => item.symbol === symbol).slice(0, 30);
  const requestedInterval = requestUrl.searchParams.get("interval");
  const newSignalInterval = states.find(({ state }) => state?.isNew)?.interval;
  const chartInterval = INTERVALS.includes(requestedInterval)
    ? requestedInterval
    : newSignalInterval || "1h";
  const widgetIntervals = { "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1w": "W" };
  const description = `${base}/USDT Supertrend sinyalleri: 5 dakika, 15 dakika, 1 saat, 4 saat, günlük ve haftalık güncel AL/SAT görünümü.`;
  const canonical = `https://sadecepara.com/kripto/${encodeURIComponent(symbolSlug(symbol))}`;
  const periodSummary = states.map(({ interval, state }) => {
    const direction = state?.direction || "BEKLİYOR";
    const css = direction === "AL" ? "buy" : direction === "SAT" ? "sell" : "";
    return `<span class="period-pill ${css}">${interval} ${escapeHtml(direction)}</span>`;
  }).join("");

  const rows = states.map(({ interval, scannedAt, state }) => {
    if (!state) return `<tr><td>${interval}</td><td colspan="6" class="muted">İlk tarama bekleniyor</td></tr>`;
    const directionClass = state.direction === "AL" ? "buy" : "sell";
    return `<tr>
      <td>${interval}</td>
      <td class="${directionClass}">${state.isNew ? "YENİ " : ""}${escapeHtml(state.direction)}</td>
      <td>${formatPrice(state.price)}</td>
      <td>${formatPrice(state.supertrend)}</td>
      <td>${Number(state.distancePercent).toFixed(2)}%</td>
      <td>${new Date(state.candleCloseTime).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</td>
      <td><a href="${canonical}?interval=${interval}#grafik">Grafiği aç</a></td>
    </tr>`;
  }).join("");

  const historyRows = history.length ? history.map((item) => `<tr>
    <td>${new Date(item.detectedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</td>
    <td>${escapeHtml(item.interval)}</td><td class="${item.signal === "YENI AL" ? "buy" : "sell"}">${escapeHtml(item.signal.replace("YENI", "YENİ"))}</td>
    <td>${formatPrice(item.entryPrice)}</td><td>${Number(item.performancePercent || 0).toFixed(2)}%</td>
  </tr>`).join("") : '<tr><td colspan="5" class="muted">Son 24 saatte kayıtlı yeni sinyal yok.</td></tr>';

  const body = `<h1>${escapeHtml(displaySymbol(symbol))} Supertrend Sinyalleri</h1>
  <p class="muted">${escapeHtml(description)}</p>
  ${latest ? `<p>Son fiyat: <strong>${formatPrice(latest.price)}</strong></p>` : ""}
  <div class="pair-tools">
    <div class="period-summary" aria-label="Çoklu periyot özeti">${periodSummary}</div>
    <button id="favorite-button" class="favorite" type="button">☆ Favoriye ekle</button>
  </div>
  <div class="share-box">
    <strong>Pariteyi paylaş</strong>
    <div class="share-buttons">
      <a id="share-telegram" class="share-telegram" target="_blank" rel="noopener">Telegram</a>
      <a id="share-whatsapp" class="share-whatsapp" target="_blank" rel="noopener">WhatsApp</a>
      <a id="share-x" class="share-x" target="_blank" rel="noopener">X</a>
    </div>
  </div>
  <script>
  (() => {
    const symbol = ${JSON.stringify(symbol)};
    const label = ${JSON.stringify(displaySymbol(symbol))};
    const key = "sadecepara-favorites";
    const button = document.querySelector("#favorite-button");
    const read = () => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
    const draw = () => {
      const active = read().includes(symbol);
      button.classList.toggle("active", active);
      button.textContent = active ? "★ Favorilerde" : "☆ Favoriye ekle";
    };
    button.addEventListener("click", () => {
      const favorites = read();
      const next = favorites.includes(symbol) ? favorites.filter(item => item !== symbol) : [...favorites, symbol];
      localStorage.setItem(key, JSON.stringify(next));
      draw();
    });
    const url = location.href;
    const text = label + " Supertrend sinyalleri";
    document.querySelector("#share-telegram").href = "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text);
    document.querySelector("#share-whatsapp").href = "https://wa.me/?text=" + encodeURIComponent(text + " " + url);
    document.querySelector("#share-x").href = "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url);
    draw();
  })();
  </script>
  <div class="chart-head"><h2 id="grafik">${escapeHtml(displaySymbol(symbol))} ${chartInterval} Grafiği</h2>
  <a class="button" href="${tradingViewUrl(symbol, chartInterval)}" target="_blank" rel="nofollow noopener">TradingView'de tam ekran</a></div>
  <div class="chart">
    <div class="tradingview-widget-container">
      <div class="tradingview-widget-container__widget"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
      ${JSON.stringify({
        autosize: true,
        symbol: `BINANCE:${symbol}`,
        interval: widgetIntervals[chartInterval],
        timezone: "Europe/Istanbul",
        theme: "dark",
        style: "1",
        locale: "tr",
        allow_symbol_change: false,
        studies: ["Supertrend@tv-basicstudies"],
        calendar: false,
        support_host: "https://www.tradingview.com",
      })}
      </script>
    </div>
  </div>
  <div class="card"><table><thead><tr><th>Periyot</th><th>Trend</th><th>Fiyat</th><th>Supertrend</th><th>Mesafe</th><th>Mum kapanışı</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <h2>Son 24 Saat Sinyal Geçmişi</h2>
  <div class="card"><table><thead><tr><th>Zaman</th><th>Periyot</th><th>Sinyal</th><th>Giriş</th><th>Performans</th></tr></thead><tbody>${historyRows}</tbody></table></div>
  ${liveTradesPanel(symbol)}`;

  return new Response(pageShell({
    title: `${base}/USDT Supertrend Sinyalleri | SadecePara`,
    description,
    canonical,
    body,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${base}/USDT Supertrend Sinyalleri`,
      url: canonical,
      dateModified: data.generatedAt,
      isPartOf: { "@type": "WebSite", name: "SadecePara", url: "https://sadecepara.com/" },
    },
  }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
};
