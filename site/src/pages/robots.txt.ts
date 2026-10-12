// Crawling is allowed everywhere. Pages that must stay out of search results say so
// themselves (noindex), which a crawler can only see if it may fetch them.
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", site).href}\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
