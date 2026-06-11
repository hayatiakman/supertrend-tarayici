import { getStore } from "@netlify/blobs";
import { displaySymbol, escapeHtml, pageShell, symbolSlug } from "./lib/page-helpers.mjs";

export default async () => {
  const store = getStore("supertrend-results");
  const data = await store.get("latest", { type: "json", consistency: "strong" });
  if (!data) return new Response("Veri hazırlanıyor.", { status: 503 });
  const markets = (data.markets || []).slice().sort();
  const body = `<h1>Binance USDT Supertrend Pariteleri</h1>
  <p class="muted">${markets.length} aktif USDT paritesi için güncel Supertrend sayfaları.</p>
  <div class="grid">${markets.map((symbol) =>
    `<a class="market" href="/kripto/${encodeURIComponent(symbolSlug(symbol))}">${escapeHtml(displaySymbol(symbol))}</a>`).join("")}</div>`;
  return new Response(pageShell({
    title: "Tüm Kripto Supertrend Pariteleri | SadecePara",
    description: "Binance USDT paritelerinin 5 dakika, 15 dakika, saatlik, günlük ve haftalık Supertrend sinyal sayfaları.",
    canonical: "https://sadecepara.com/pariteler",
    body,
  }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
};
