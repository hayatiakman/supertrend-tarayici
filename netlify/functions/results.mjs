import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("supertrend-results");
  const result = await store.get("latest", { type: "json", consistency: "strong" });
  if (!result) {
    return new Response(JSON.stringify({ error: "Ilk tarama henuz tamamlanmadi." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
