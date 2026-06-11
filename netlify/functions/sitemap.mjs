import { getStore } from "@netlify/blobs";
import { symbolSlug } from "./lib/page-helpers.mjs";

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export default async () => {
  const store = getStore("supertrend-results");
  const data = await store.get("latest", { type: "json", consistency: "strong" });
  const modified = (data?.generatedAt || new Date().toISOString()).slice(0, 10);
  const urls = [
    { loc: "https://sadecepara.com/", priority: "1.0", changefreq: "hourly" },
    { loc: "https://sadecepara.com/pariteler", priority: "0.9", changefreq: "daily" },
    ...(data?.markets || []).map((symbol) => ({
      loc: `https://sadecepara.com/kripto/${encodeURIComponent(symbolSlug(symbol))}`,
      priority: "0.7",
      changefreq: "hourly",
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url.loc)}</loc><lastmod>${modified}</lastmod><changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`).join("\n")}
</urlset>`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
};
