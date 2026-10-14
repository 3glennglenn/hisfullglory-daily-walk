// Official bulk USFM only; no scraping. Usage: node scripts/import-web.mjs PATH_TO_EXTRACTED_USFM
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verseWithSpeakers } from "./usfm.mjs";
const folder = process.argv[2];
if (!folder) throw new Error("Provide the extracted official WEB USFM folder.");
const books = [];
for (const file of readdirSync(folder)
  .filter((f) => f.endsWith(".usfm"))
  .sort()) {
  const raw = readFileSync(join(folder, file), "utf8");
  const id = raw.match(/\\id\s+(\w+)/)?.[1];
  if (!id || ["FRT", "BAK", "GLO", "INT"].includes(id)) continue;
  const name = raw.match(/\\toc2\s+([^\r\n]+)/)?.[1].trim();
  if (!name) continue;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, "");
  const chapters = [];
  let opening = []; // speaker labels waiting for the next verse (Song of Songs)
  for (const chapter of raw.split(/\\c\s+/).slice(1)) {
    const number = Number(chapter.match(/^\d+/)?.[0]);
    const intro = chapter.slice(0, Math.max(0, chapter.search(/\\v\s+\d+\s/)));
    for (const m of intro.matchAll(/^\\sp[ \t]+([^\n]*)$/gm)) opening.push(m[1].trim());
    const verses = [
      ...chapter.matchAll(/\\v\s+(\d+)\s+([\s\S]*?)(?=\\v\s+\d+\s|$)/g),
    ].map((m) => {
      const { text, speakers, next } = verseWithSpeakers(m[2], opening);
      opening = next;
      return {
        number: Number(m[1]),
        text,
        omitted: !text,
        ...(speakers.length ? { speakers } : {}),
      };
    });
    if (
      !verses.length ||
      verses.some((v) => v.text.includes("\\") || v.text.includes("strong=")) ||
      verses.some((v) =>
        v.speakers?.some(
          (s) =>
            !/^[A-Z][a-z]+$/.test(s.label) ||
            (s.at > 0 && v.text[s.at - 1] !== " "),
        ),
      )
    )
      throw new Error(`Invalid parsed chapter ${id} ${number}`);
    chapters.push({ number, verses });
  }
  if (opening.length)
    throw new Error(`Speaker label after the last verse of ${id}: ${opening}`);
  books.push({ id, slug, name, chapters });
}
if (books.length !== 66)
  throw new Error(`Expected 66 canonical books; found ${books.length}`);
mkdirSync("public/bible", { recursive: true });
const text = JSON.stringify({
  translation: "WEB",
  source: "https://ebible.org/Scriptures/engwebp_usfm.zip",
  license: "Public domain",
  downloadedOn: "2026-10-07",
  books,
});
writeFileSync("public/bible/web.json", text);
console.log({
  books: books.length,
  chapters: books.reduce((n, b) => n + b.chapters.length, 0),
  verses: books.reduce(
    (n, b) => n + b.chapters.reduce((n, c) => n + c.verses.length, 0),
    0,
  ),
  bytes: Buffer.byteLength(text),
  sha256: createHash("sha256").update(text).digest("hex"),
});
