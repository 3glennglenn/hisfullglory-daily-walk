import { contextNotes, type BibleData } from "./provider.ts";
export type KnowledgeScope = "book" | "chapter" | "passage" | "verse";
export type InterpretiveStatus =
  | "broad consensus"
  | "common interpretation"
  | "debated"
  | "tradition-specific"
  | "editorial observation";
export type ReviewStatus = "editorial draft" | "reviewed";
export interface KnowledgeSource { title: string; url: string; }
export interface KnowledgeRecord {
  id: string; book: string; chapter?: number; start?: number; end?: number;
  scope: KnowledgeScope; text: string; source: string; editor: string;
  interpretiveStatus: InterpretiveStatus;
  /** Further cited sources beyond `source`; every entry is a safe HTTPS link. */
  sources?: readonly KnowledgeSource[];
  /** Scripture paths (/bible/book/chapter/verse) the note's claims rest on. */
  basis?: readonly string[];
  review?: ReviewStatus;
}
// Preserve the existing checked textual observations; no invented scholarship.
export const knowledgeRecords: readonly KnowledgeRecord[] = Object.entries(contextNotes).map(([key,note]) => {
  const [book,chapter]=key.split("/");
  return {id:"chapter:"+key,book,chapter:Number(chapter),scope:"chapter",text:note.text,source:note.source,editor:"HisFullGlory editorial",interpretiveStatus:"editorial observation"};
});
export function knowledgeFor(book:string,chapter:number,verse?:number,records=knowledgeRecords): KnowledgeRecord | undefined {
  const priority:Record<KnowledgeScope,number>={verse:4,passage:3,chapter:2,book:1};
  return records.filter(r=>r.book===book&&(r.scope==="book"||r.chapter===chapter)&&
    (r.start===undefined||verse!==undefined&&verse>=r.start&&verse<=(r.end??r.start)))
    .sort((a,b)=>priority[b.scope]-priority[a.scope])[0];
}
export interface GroundingSource {id:string; authority:"Scripture"|"Editorial observation"; reference:string; text:string;}
export function assembleGrounding(data:BibleData,book:string,chapter:number,verse?:number,records=knowledgeRecords):GroundingSource[] {
  const selected=data.books.find(b=>b.slug===book)?.chapters.find(c=>c.number===chapter);
  if(!selected)return [];
  const scripture=selected.verses.filter(v=>!v.omitted&&(verse===undefined||v.number===verse));
  if(!scripture.length)return [];
  const sources:GroundingSource[]=[{id:`web:${book}/${chapter}${verse?"/"+verse:""}`,authority:"Scripture",reference:`/bible/${book}/${chapter}${verse?"/"+verse:""}`,text:scripture.map(v=>`${v.number} ${v.text}`).join("\n")}];
  const note=knowledgeFor(book,chapter,verse,records);
  if(note)sources.push({id:note.id,authority:"Editorial observation",reference:note.source,text:note.text});
  return sources;
}
export interface GroundedStudyProvider {
  // Implement on a server only; no provider credentials or private state here.
  explain(question:string,sources:readonly GroundingSource[]):Promise<{text:string;sourceIds:string[]}>;
}

// ---- Study library: static, public, per-book files under /study/<slug>.json ----
const scopes: readonly KnowledgeScope[] = ["book","chapter","passage","verse"];
const statuses: readonly InterpretiveStatus[] = ["broad consensus","common interpretation","debated","tradition-specific","editorial observation"];
const safeUrl = (u: unknown): u is string =>
  typeof u === "string" && u.length <= 2000 && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s\\]*)?$/i.test(u);
const positive = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
/**
 * Validates one study file against the Bible it annotates. Invalid records are
 * rejected whole, so a malformed file shows the honest fallback instead of
 * partial or misattributed notes.
 */
export function parseStudyFile(raw: unknown, book: string, data?: BibleData): KnowledgeRecord[] {
  if (!raw || typeof raw !== "object" || (raw as {book?: unknown}).book !== book) throw new Error(`Study file must declare book "${book}"`);
  const list = (raw as {records?: unknown}).records;
  if (!Array.isArray(list) || list.length > 2000) throw new Error("Study file needs a records array");
  const bible = data?.books.find(b => b.slug === book);
  if (data && !bible) throw new Error(`Unknown book "${book}"`);
  const ids = new Set<string>();
  return list.map((r: Record<string, unknown>, i) => {
    const where = `${book} record ${i}`;
    if (!r || typeof r !== "object") throw new Error(`${where}: not an object`);
    const scope = r.scope as KnowledgeScope;
    if (!scopes.includes(scope)) throw new Error(`${where}: invalid scope`);
    if (typeof r.id !== "string" || !/^[a-z0-9:/-]{1,80}$/.test(r.id) || ids.has(r.id)) throw new Error(`${where}: id must be unique`);
    ids.add(r.id);
    if (typeof r.text !== "string" || r.text.trim().length < 20 || r.text.length > 4000) throw new Error(`${where}: text length`);
    if (!safeUrl(r.source)) throw new Error(`${where}: source must be HTTPS`);
    if (!statuses.includes(r.interpretiveStatus as InterpretiveStatus)) throw new Error(`${where}: invalid interpretive status`);
    if (r.review !== undefined && r.review !== "editorial draft" && r.review !== "reviewed") throw new Error(`${where}: invalid review`);
    if (scope !== "book" && !positive(r.chapter)) throw new Error(`${where}: chapter required`);
    if ((scope === "passage" || scope === "verse") && !positive(r.start)) throw new Error(`${where}: start verse required`);
    if (r.end !== undefined && (!positive(r.end) || (r.end as number) < (r.start as number))) throw new Error(`${where}: invalid end verse`);
    if (bible && r.chapter !== undefined) {
      const ch = bible.chapters.find(c => c.number === r.chapter);
      if (!ch) throw new Error(`${where}: chapter not in ${book}`);
      const last = Math.max(...ch.verses.map(v => v.number));
      if ((r.start as number) > last || (r.end as number) > last) throw new Error(`${where}: verse beyond chapter`);
    }
    const sources = r.sources === undefined ? undefined : r.sources;
    if (sources !== undefined && (!Array.isArray(sources) || sources.length > 8 ||
      sources.some(s => !s || typeof s.title !== "string" || !s.title.trim() || s.title.length > 200 || !safeUrl(s.url))))
      throw new Error(`${where}: sources need a title and HTTPS url`);
    const basis = r.basis;
    if (basis !== undefined && (!Array.isArray(basis) || basis.length > 20 ||
      basis.some(p => typeof p !== "string" || !versePathExists(p, data))))
      throw new Error(`${where}: basis must be existing Scripture paths`);
    return {
      id: r.id, book, scope, text: r.text, source: r.source as string,
      editor: typeof r.editor === "string" && r.editor.trim() ? r.editor : "HisFullGlory editorial",
      interpretiveStatus: r.interpretiveStatus as InterpretiveStatus,
      review: (r.review as ReviewStatus | undefined) ?? "editorial draft",
      ...(r.chapter !== undefined ? {chapter: r.chapter as number} : {}),
      ...(r.start !== undefined ? {start: r.start as number} : {}),
      ...(r.end !== undefined ? {end: r.end as number} : {}),
      ...(sources ? {sources: sources as KnowledgeSource[]} : {}),
      ...(basis ? {basis: basis as string[]} : {}),
    };
  });
}
function versePathExists(path: string, data?: BibleData): boolean {
  const m = /^\/bible\/([a-z0-9-]+)\/(\d+)(?:\/(\d+))?$/.exec(path);
  if (!m) return false;
  if (!data) return true;
  const ch = data.books.find(b => b.slug === m[1])?.chapters.find(c => c.number === Number(m[2]));
  return !!ch && (m[3] === undefined || ch.verses.some(v => v.number === Number(m[3]) && !v.omitted));
}
const studyCache = new Map<string, Promise<KnowledgeRecord[]>>();
/** Loads a book's public study notes; a missing or invalid file yields [] (honest fallback). */
export function loadStudyRecords(book: string, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<KnowledgeRecord[]> {
  if (!/^[a-z0-9-]+$/.test(book)) return Promise.resolve([]);
  let pending = studyCache.get(book);
  if (!pending) {
    pending = fetcher(`/study/${book}.json`)
      .then(async r => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? parseStudyFile(await r.json(), book) : []))
      .catch(() => { studyCache.delete(book); return []; });
    studyCache.set(book, pending);
  }
  return pending;
}
export function clearStudyCache() { studyCache.clear(); }
export const scopeLabel: Record<KnowledgeScope, string> = {
  book: "Book context", chapter: "Chapter context", passage: "Passage note", verse: "Verse note",
};
