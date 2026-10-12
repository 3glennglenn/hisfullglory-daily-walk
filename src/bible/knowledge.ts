import { contextNotes, type BibleData } from "./provider.ts";
export type KnowledgeScope = "book" | "chapter" | "passage" | "verse";
export interface KnowledgeRecord {
  id: string; book: string; chapter?: number; start?: number; end?: number;
  scope: KnowledgeScope; text: string; source: string; editor: string;
  interpretiveStatus: "editorial observation" | "debated" | "tradition-specific";
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
export function assembleGrounding(data:BibleData,book:string,chapter:number,verse?:number):GroundingSource[] {
  const selected=data.books.find(b=>b.slug===book)?.chapters.find(c=>c.number===chapter);
  if(!selected)return [];
  const scripture=selected.verses.filter(v=>!v.omitted&&(verse===undefined||v.number===verse));
  if(!scripture.length)return [];
  const sources:GroundingSource[]=[{id:`web:${book}/${chapter}${verse?"/"+verse:""}`,authority:"Scripture",reference:`/bible/${book}/${chapter}${verse?"/"+verse:""}`,text:scripture.map(v=>`${v.number} ${v.text}`).join("\n")}];
  const note=knowledgeFor(book,chapter,verse);
  if(note)sources.push({id:note.id,authority:"Editorial observation",reference:note.source,text:note.text});
  return sources;
}
export interface GroundedStudyProvider {
  // Implement on a server only; no provider credentials or private state here.
  explain(question:string,sources:readonly GroundingSource[]):Promise<{text:string;sourceIds:string[]}>;
}
