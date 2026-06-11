export const INTERVALS = ["5m", "15m", "1h", "4h", "1d", "1w"];
export const EXCHANGE_CATALOG = [
  "Binance", "Bybit", "OKX", "Bitget", "Coinbase", "Kraken", "KuCoin", "Gate.io", "MEXC", "HTX",
  "Crypto.com", "Bitfinex", "Gemini", "Deribit", "Upbit", "BingX", "LBank", "Phemex", "BitMart",
  "CoinEx", "WhiteBIT", "XT.com", "AscendEX", "CoinW", "WEEX", "Toobit", "BloFin", "KCEX",
  "Deepcoin", "BTSE", "Bitrue", "DigiFinex", "OrangeX", "Hotcoin", "Tapbit", "Bitstamp", "Bullish",
  "Coinmetro", "CEX.IO", "Mercado Bitcoin", "Bitvavo", "Independent Reserve", "Bithumb", "Korbit",
  "Coincheck", "Zaif", "Bitkub", "Indodax", "Pintu Pro", "WOO X", "HashKey", "Delta Exchange",
  "Paribu", "BtcTurk", "Binance TR", "Bitlo", "CoinTR", "Icrypex",
];

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function symbolSlug(symbol) {
  return symbol.replace(/USDT$/, "").toLocaleLowerCase("en-US");
}

export function displaySymbol(symbol) {
  return symbol.replace(/USDT$/, "/USDT");
}

export function tradingViewUrl(symbol, interval) {
  const values = { "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1w": "W" };
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`BINANCE:${symbol}`)}&interval=${values[interval]}`;
}

export function liveTradesPanel(symbol) {
  const base = symbol.replace(/USDT$/, "");
  const liveExchanges = new Set(["Binance", "Bybit", "OKX", "Gate.io", "Kraken", "Coinbase"]);
  const links = [
    ["Binance", `https://www.binance.com/en/trade/${base}_USDT?type=spot`],
    ["Bybit", `https://www.bybit.com/trade/spot/${base}/USDT`],
    ["OKX", `https://www.okx.com/trade-spot/${base.toLowerCase()}-usdt`],
    ["KuCoin", `https://www.kucoin.com/trade/${base}-USDT`],
    ["Gate.io", `https://www.gate.com/trade/${base}_USDT`],
    ["MEXC", `https://www.mexc.com/exchange/${base}_USDT`],
    ["Kraken", `https://pro.kraken.com/app/trade/${base.toLowerCase()}-usdt`],
    ["Coinbase", `https://www.coinbase.com/advanced-trade/spot/${base}-USDT`],
    ["Bitget", `https://www.bitget.com/spot/${base}USDT`],
  ].map(([name, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="nofollow noopener">${name}</a>`).join("");
  const coverage = EXCHANGE_CATALOG.map((name) =>
    `<span class="coverage-chip ${liveExchanges.has(name) ? "connected" : ""}">${escapeHtml(name)}${liveExchanges.has(name) ? " · CANLI" : ""}</span>`).join("");

  return `<section class="market-live">
  <div class="live-heading">
    <div><h2>Canlı Alım Satımlar</h2><div class="muted">Binance, Bybit, OKX, Gate.io, Kraken ve Coinbase Spot işlemleri tek akışta</div></div>
    <div class="exchange-links">${links}</div>
  </div>
  <div class="trade-controls">
    <label>Minimum işlem <input id="trade-minimum" type="number" min="0" step="100" value="0"> USDT</label>
    <button id="trade-pause" type="button">Akışı durdur</button>
    <span id="trade-status" class="muted">Bağlanıyor...</span>
  </div>
  <div class="trade-stats"><span class="buy">AL <strong id="buy-volume">0</strong> USDT</span><span class="sell">SAT <strong id="sell-volume">0</strong> USDT</span></div>
  <div class="card trade-card"><table><thead><tr><th>Saat</th><th>Borsa</th><th>Yön</th><th>Fiyat</th><th>Miktar</th><th>Tutar</th></tr></thead><tbody id="live-trades"><tr><td colspan="6" class="muted">Canlı işlemler bekleniyor...</td></tr></tbody></table></div>
  <details class="exchange-coverage">
    <summary>Borsa kapsamı: ${EXCHANGE_CATALOG.length} borsa</summary>
    <p class="muted">CANLI etiketi gerçek zamanlı birleşik akışa bağlı borsaları gösterir. Diğerleri parite ve açık API uyumluluğu doğrulandıkça etkinleştirilir.</p>
    <div class="coverage-grid">${coverage}</div>
  </details>
  </section>
  <script>
  (() => {
    const symbol = ${JSON.stringify(symbol)};
    const trades = [];
    const sockets = [];
    let paused = false, scheduled = false, buyVolume = 0, sellVolume = 0;
    const body = document.querySelector("#live-trades");
    const status = document.querySelector("#trade-status");
    const minimum = document.querySelector("#trade-minimum");
    const pause = document.querySelector("#trade-pause");
    const format = value => Number(value).toLocaleString("en-US", { maximumSignificantDigits: 9 });
    const render = () => {
      scheduled = false;
      const min = Number(minimum.value || 0);
      const visible = trades.filter(item => item.value >= min).slice(0, 80);
      body.replaceChildren();
      if (!visible.length) {
        const row = body.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6; cell.className = "muted"; cell.textContent = "Filtreye uygun işlem bekleniyor...";
      }
      for (const item of visible) {
        const row = body.insertRow();
        row.className = item.side === "AL" ? "trade-buy" : "trade-sell";
        [new Date(item.time).toLocaleTimeString("tr-TR"), item.exchange, item.side, format(item.price), format(item.quantity), format(item.value) + " USDT"]
          .forEach((value, index) => { const cell = row.insertCell(); cell.textContent = value; if (index === 2) cell.className = item.side === "AL" ? "buy" : "sell"; });
      }
      document.querySelector("#buy-volume").textContent = format(buyVolume);
      document.querySelector("#sell-volume").textContent = format(sellVolume);
    };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(render); } };
    const add = item => {
      if (paused || !Number.isFinite(item.price) || !Number.isFinite(item.quantity)) return;
      item.value = item.price * item.quantity;
      trades.unshift(item);
      if (trades.length > 300) trades.length = 300;
      if (item.side === "AL") buyVolume += item.value; else sellVolume += item.value;
      schedule();
    };
    const binance = new WebSocket("wss://stream.binance.com:9443/ws/" + symbol.toLowerCase() + "@aggTrade");
    binance.addEventListener("message", event => {
      const data = JSON.parse(event.data);
      add({ exchange: "Binance", side: data.m ? "SAT" : "AL", price: Number(data.p), quantity: Number(data.q), time: data.T });
    });
    sockets.push(binance);
    const bybit = new WebSocket("wss://stream.bybit.com/v5/public/spot");
    bybit.addEventListener("open", () => bybit.send(JSON.stringify({ op: "subscribe", args: ["publicTrade." + symbol] })));
    bybit.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      for (const data of message.data || []) add({ exchange: "Bybit", side: data.S === "Buy" ? "AL" : "SAT", price: Number(data.p), quantity: Number(data.v), time: data.T });
    });
    sockets.push(bybit);
    const okx = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
    okx.addEventListener("open", () => okx.send(JSON.stringify({ op: "subscribe", args: [{ channel: "trades", instId: symbol.replace(/USDT$/, "-USDT") }] })));
    okx.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      for (const data of message.data || []) add({ exchange: "OKX", side: data.side === "buy" ? "AL" : "SAT", price: Number(data.px), quantity: Number(data.sz), time: Number(data.ts) });
    });
    sockets.push(okx);
    const gate = new WebSocket("wss://api.gateio.ws/ws/v4/");
    gate.addEventListener("open", () => gate.send(JSON.stringify({
      time: Math.floor(Date.now() / 1000), channel: "spot.trades", event: "subscribe",
      payload: [symbol.replace(/USDT$/, "_USDT")]
    })));
    gate.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      const data = message.event === "update" && message.channel === "spot.trades" ? message.result : null;
      if (data) add({ exchange: "Gate.io", side: data.side === "buy" ? "AL" : "SAT", price: Number(data.price), quantity: Number(data.amount), time: Number.parseFloat(data.create_time_ms) });
    });
    sockets.push(gate);
    const kraken = new WebSocket("wss://ws.kraken.com/v2");
    kraken.addEventListener("open", () => kraken.send(JSON.stringify({
      method: "subscribe", params: { channel: "trade", symbol: [symbol.replace(/USDT$/, "/USDT")], snapshot: false }
    })));
    kraken.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.channel !== "trade") return;
      for (const data of message.data || []) add({
        exchange: "Kraken", side: data.side === "buy" ? "AL" : "SAT",
        price: Number(data.price), quantity: Number(data.qty), time: Date.parse(data.timestamp)
      });
    });
    sockets.push(kraken);
    const coinbase = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    coinbase.addEventListener("open", () => coinbase.send(JSON.stringify({
      type: "subscribe", product_ids: [symbol.replace(/USDT$/, "-USDT")], channels: ["matches"]
    })));
    coinbase.addEventListener("message", event => {
      const data = JSON.parse(event.data);
      if (data.type !== "match" && data.type !== "last_match") return;
      add({
        exchange: "Coinbase", side: data.side === "buy" ? "AL" : "SAT",
        price: Number(data.price), quantity: Number(data.size), time: Date.parse(data.time)
      });
    });
    sockets.push(coinbase);
    let opened = 0;
    for (const socket of sockets) {
      socket.addEventListener("open", () => { opened += 1; status.textContent = opened + "/6 borsa bağlantısı açık"; });
      socket.addEventListener("error", () => { status.textContent = "Bazı borsa akışlarına bağlanılamadı"; });
    }
    minimum.addEventListener("input", schedule);
    pause.addEventListener("click", () => { paused = !paused; pause.textContent = paused ? "Akışı sürdür" : "Akışı durdur"; });
    window.addEventListener("pagehide", () => sockets.forEach(socket => socket.close()));
  })();
  </script>`;
}

export function pageShell({ title, description, canonical, body, structuredData }) {
  const jsonLd = structuredData
    ? `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll("<", "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">
${jsonLd}
<style>
:root{color-scheme:dark;--bg:#0b1020;--card:#121a2e;--line:#26314b;--muted:#9ba7bc;--buy:#64e6b3;--sell:#ff91a0}
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:var(--bg);color:#e8edf7;margin:0;padding:20px}
main{max-width:1050px;margin:auto}a{color:#7dcfff}h1{margin:8px 0;font-size:27px}h2{margin-top:26px;font-size:20px}
.nav{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}.nav a{text-decoration:none}.muted{color:var(--muted)}
.card{overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:11px;border-bottom:1px solid #222c43;text-align:right}
th:first-child,td:first-child{text-align:left}th{font-size:12px;color:#aab4c7;text-transform:uppercase}.buy{color:var(--buy);font-weight:800}.sell{color:var(--sell);font-weight:800}
.button{display:inline-block;padding:9px 12px;border-radius:8px;background:#273656;color:#fff;text-decoration:none;font-weight:700}
.pair-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:16px 0}
.period-summary,.share-buttons{display:flex;gap:7px;flex-wrap:wrap}.period-pill{padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--card);font-size:13px;font-weight:800}.period-pill.buy{border-color:#24644f;background:#173d35}.period-pill.sell{border-color:#713442;background:#44242e}
.favorite{padding:9px 12px;border:1px solid #665323;border-radius:8px;background:#211d16;color:#ffe29a;font:inherit;font-weight:800;cursor:pointer}.favorite.active{background:#665323;color:#fff}
.share-box{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0 20px}.share-buttons a{padding:8px 11px;border-radius:8px;color:#fff;text-decoration:none;font-weight:800;font-size:13px}.share-telegram{background:#229ed9}.share-whatsapp{background:#1f9d55}.share-x{background:#20242c}
.market-live{margin-top:25px}.live-heading,.trade-controls,.trade-stats{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.live-heading h2{margin:0 0 4px}.exchange-links{display:flex;gap:6px;flex-wrap:wrap}.exchange-links a{padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--card);text-decoration:none;font-size:12px;font-weight:700}.trade-controls{margin:12px 0}.trade-controls label{display:flex;align-items:center;gap:7px}.trade-controls input{width:115px;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:#fff}.trade-controls button{padding:8px 10px;border:1px solid var(--line);border-radius:7px;background:#273656;color:#fff;cursor:pointer}.trade-stats{justify-content:flex-start;margin-bottom:9px}.trade-stats span{padding:7px 10px;border-radius:7px;background:var(--card)}.trade-card{max-height:440px}.trade-card table{min-width:650px}.trade-card tbody tr:first-child{animation:trade-flash .45s ease}.trade-buy{background:#173d3528}.trade-sell{background:#44242e28}@keyframes trade-flash{from{filter:brightness(1.8)}to{filter:brightness(1)}}
.exchange-coverage{margin-top:14px;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:10px}.exchange-coverage summary{cursor:pointer;font-weight:800}.coverage-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.coverage-chip{padding:6px 8px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px}.coverage-chip.connected{border-color:#24644f;background:#173d35;color:var(--buy);font-weight:800}
.chart{height:560px;margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.chart .tradingview-widget-container,.chart .tradingview-widget-container__widget{height:100%;width:100%}
.chart-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}.market{padding:9px;background:var(--card);border:1px solid var(--line);border-radius:8px;text-decoration:none}
footer{margin-top:28px;color:var(--muted);font-size:13px}@media(max-width:650px){body{padding:12px}h1{font-size:22px}.chart{height:430px}}
</style></head><body><main>
<nav class="nav"><a href="/">Ana sinyal ekranı</a><a href="/pariteler">Tüm pariteler</a><a href="https://t.me/sadeceparacom">Telegram</a></nav>
${body}
<footer>Bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.</footer>
</main></body></html>`;
}
