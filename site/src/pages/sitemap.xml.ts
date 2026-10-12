// One sitemap for the whole site: about 1,260 addresses, far below the 50,000 limit.
import type { APIRoute } from "astro";
import { indexablePaths } from "../lib/pages.ts";

export const GET: APIRoute = ({ site }) => {
  const urls = indexablePaths()
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
