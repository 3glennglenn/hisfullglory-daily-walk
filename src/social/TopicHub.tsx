import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../supabase";
import { useAuth } from "../platform/auth";
import { postError } from "./blockedLanguage";
import { usePlatform } from "../platform/store";
import { navigate } from "../platform/router";
import { findTopic, launchTopics, topicGraph } from "../topics/graph";
import { Community } from "../community";
import { contentFor, type DailyContent } from "../data";
import { localDate } from "../storage";
import { CircleRows } from "./CircleRows";
import { SafetyControls } from "./safety";
import { Feed, postTypes } from "./Feed";
import { safeSourceUrl } from "./sources";
import { TitleRow } from "../ui/Screen";
import { GroupedList, Row } from "../ui/List";
import { Segmented } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
// The three segments of Community (01.2 D-06). The last one is kept in module memory while the app stays open, so Back
// from a Circle lands on Circles; it is never written to the device.
const segments = [
  { value: "topics", label: "Topics" },
  { value: "circles", label: "Circles" },
  { value: "prayer", label: "Prayer wall" },
] as const;
type Segment = (typeof segments)[number]["value"];
let lastSegment: Segment = "topics";
interface Discussion {
  id:string; display_name:string; body:string; post_type:string; created_at:string;
  is_owner:boolean; score:number; upvotes:number; voted:boolean; helped:number;
  reputation:number|null; replies:number; sources:{title:string;url:string}[];
}
export function TopicHub({id,thread,verse,online}: {id?:string;thread?:string;verse?:DailyContent;online?:boolean}) {
  const {state,update}=usePlatform();
  const {session,accepted}=useAuth();
  const [deleting,setDeleting]=useState<string|null>(null);
  const [sorting,setSorting]=useState("newest");
  const [posts,setPosts]=useState<Discussion[]>([]);
  const [root,setRoot]=useState<Discussion|null>(null);
  const [memberships,setMemberships]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [more,setMore]=useState(false);
  const [revision,setRevision]=useState(0);
  const [body,setBody]=useState("");
  const [kind,setKind]=useState("question");
  const [anonymous,setAnonymous]=useState(false);
  const [sourceTitle,setSourceTitle]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const sequence=useRef(0);
  const topic=findTopic(id);
  useEffect(() => {
    const changed=()=>setRevision(n=>n+1);
    window.addEventListener("hfg-blocks-changed",changed);
    return ()=>{sequence.current++;window.removeEventListener("hfg-blocks-changed",changed);};
  },[]);
  useEffect(()=>{
    let active=true;
    if (!supabase || !session) {setMemberships([]);return;}
    void supabase.from("community_memberships").select("topic_id").then(({data,error})=>{
      if(active && !error) setMemberships((data??[]).map(row=>String(row.topic_id)));
    });
    return ()=>{active=false;};
  },[session?.user.id,revision]);
  async function load(append=false) {
    if(!supabase || !topic) return;
    const request=++sequence.current;
    const last=append?posts.at(-1):undefined;
    setBusy(true);setStatus("");
    if(thread) {
      const original=await supabase.rpc("read_topic_thread",{selected_topic:topic.id,thread_id:thread});
      if(request!==sequence.current) return;
      setRoot(original.error?null:original.data as Discussion|null);
      if(original.error||!original.data){setPosts([]);setBusy(false);setStatus("This thread is unavailable, removed or blocked.");return;}
    } else setRoot(null);
    const {data,error}=await supabase.rpc("read_topic_discussions",{selected_topic:topic.id,reply_to:thread??null,sorting,before_score:last?.score??null,before_time:last?.created_at??null,before_id:last?.id??null});
    if(request!==sequence.current) return;
    setBusy(false);
    if(error){setPosts([]);setMore(false);setStatus("Topic discussions are unavailable. Check your connection or ask the operator about migration 005.");return;}
    const rows=(data??[]) as Discussion[];
    setPosts(previous=>append?[...previous,...rows.filter(p=>!previous.some(old=>old.id===p.id))]:rows);setMore(rows.length===20);
  }
  useEffect(()=>{sequence.current++;setPosts([]);setRoot(null);setMore(false);void load();},[topic?.id,thread,sorting,revision]);
  useEffect(()=>{setBody("");setSourceTitle("");setSourceUrl("");},[topic?.id,thread]);
  async function action(name:string,args:Record<string,unknown>) {
    if(!supabase || busy) return false;
    const request=sequence.current;
    setBusy(true);
    const {error}=await supabase.rpc(name,args);
    if(request!==sequence.current) return false;
    setBusy(false);
    if(error){setStatus(postError(error,"Could not save. Check sign-in, current rules, ownership, safe sources and rate limits; then retry."));return false;}
    setStatus("Saved.");setRevision(n=>n+1);return true;
  }
  if(id && !topic) return <section><h1>Topic not found</h1><button onClick={()=>navigate("/community")}>Browse topics</button></section>;
  if(!topic) return <CommunityRoot verse={verse??contentFor(localDate())} online={online??navigator.onLine}/>;
  const member=memberships.includes(topic.id);
  return <section><button className="text-button" onClick={()=>navigate("/community")}>← Topics</button><h1>{topic.label}</h1>
    <p>Share only what you want public. If you are in immediate danger, contact local emergency services or someone who can help you reach safety. Community advice does not replace appropriate professional or pastoral support.</p>
    <button className="secondary" aria-pressed={state.followedTopics.includes(topic.id)} onClick={()=>update(s=>({...s,followedTopics:s.followedTopics.includes(topic.id)?s.followedTopics.filter(t=>t!==topic.id):[...s.followedTopics,topic.id]}))}>{state.followedTopics.includes(topic.id)?"Unfollow topic":"Follow privately on this device"}</button>
    {session&&<button disabled={busy||!accepted&&!member} onClick={()=>void action("set_topic_membership",{selected_topic:topic.id,joining:!member})}>{member?"Leave community":"Join community"}</button>}
    <p>Joining stores a private membership for your account on the server. Private struggle preferences never join automatically.</p>
    <div className="card"><h2>Scripture and resources</h2>{topic.passages.map(path=><button className="text-button" key={path} onClick={()=>navigate(path)}>{path.replace("/bible/","").replaceAll("/"," · ")}</button>)}{topic.devotional&&<button className="secondary" onClick={()=>navigate("/grow/"+topic.devotional)}>Related devotional</button>}<small>Editorial topic links, not claims about diagnosis or guaranteed outcomes.</small></div>
    {thread&&<button className="secondary" onClick={()=>navigate("/community/"+topic.id)}>Back to discussions</button>}
    <label>Discussion order<select value={sorting} onChange={e=>setSorting(e.target.value)}><option value="newest">Newest</option><option value="top">Top · last 30 days</option><option value="helpful">Most helpful · last 30 days</option></select></label>
    {!supabase?<p>Live discussions are not configured. Browsing resources and private following remain available.</p>:<><p role="status">{status || (busy?"Loading…":posts.length?"":"No visible contributions here yet.")}</p><button className="secondary" disabled={busy} onClick={()=>void load()}>Retry / refresh discussions</button>
      {[...(root?[root]:[]),...posts].map(p=><article className="card" key={p.id}><h2>{p.display_name}</h2><small>{p.post_type} · {new Date(p.created_at).toLocaleDateString()}</small><p className="preserve">{p.body}</p>
        {p.reputation!==null&&<p>Community reputation · {p.reputation} · usefulness, not spiritual worth or verified expertise</p>}
        {!!p.sources.length&&<div><h3>Sources included · not independently verified</h3>{p.sources.filter(s=>safeSourceUrl(s.url)).map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} · {new URL(s.url).hostname}</a></p>)}</div>}
        <div className="actions"><button className="secondary" disabled={busy||!session||p.is_owner} aria-pressed={p.voted} onClick={()=>void action("set_contribution_vote",{contribution_id:p.id,voting:!p.voted})}>{p.voted?"Remove upvote":"Upvote"} · {p.upvotes}</button><button className="secondary" disabled={busy||!session||p.is_owner} onClick={()=>void action("react_community_post",{post_id:p.id,reaction_name:"helped"})}>This helped me · {p.helped}</button>
          {!thread&&<button onClick={()=>navigate("/community/"+topic.id+"?thread="+p.id)}>Open discussion · {p.replies} replies</button>}
          {(!thread||p.id===thread)&&<button className="secondary" aria-pressed={state.savedDiscussions.includes(p.id)} onClick={()=>update(s=>({...s,savedDiscussions:s.savedDiscussions.includes(p.id)?s.savedDiscussions.filter(id=>id!==p.id):[...s.savedDiscussions,p.id],savedDiscussionTopics:{...s.savedDiscussionTopics,[p.id]:topic.id}}))}>{state.savedDiscussions.includes(p.id)?"Unsave discussion":"Save discussion privately"}</button>}
          {p.is_owner&&<button className="secondary" disabled={busy} onClick={()=>setDeleting(p.id)}>Delete my contribution</button>}
        </div><SafetyControls id={p.id} kind="post" onChange={()=>setRevision(n=>n+1)}/></article>)}
      {deleting&&<ConfirmDialog title="Delete this public contribution?" body="It is removed for everyone. This cannot be undone." actionLabel="Delete contribution" safeLabel="Keep contribution" destructive busyLabel="Deleting…" onAction={async()=>{
        // Not while a load is running: action() would do nothing and the dialog would close as if it had.
        if(busy) return;
        await action("delete_community_post",{post_id:deleting});
        setDeleting(null);
      }} onSafe={()=>setDeleting(null)}/>}
      {more&&<button disabled={busy} onClick={()=>void load(true)}>Load more discussions</button>}
      {!session||!accepted?<p>Sign in and accept current rules in Profile before joining or posting.</p>:!member?<p>Join this community explicitly to publish.</p>:thread&&!root?<p>Replies are unavailable for this thread.</p>:<form className="card" onSubmit={e=>{e.preventDefault();if(sourceUrl&&!safeSourceUrl(sourceUrl)||!!sourceTitle!==!!sourceUrl){setStatus("Provide both a title and a safe HTTPS source URL, or leave both empty.");return;}void action("publish_topic_post",{post_body:body.trim(),post_kind:kind,selected_topic:topic.id,reply_to:thread??null,source_items:sourceUrl?[{title:sourceTitle.trim(),url:sourceUrl}]:[],anonymous}).then(saved=>{if(saved){setBody("");setSourceTitle("");setSourceUrl("");}});}}>
        <h2>{thread?"Reply publicly":"Start a discussion"}</h2><label>Contribution type<select value={kind} onChange={e=>setKind(e.target.value)}>{["question","advice","scripture","resource",...postTypes].map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Your public words<textarea required minLength={3} maxLength={2000} value={body} onChange={e=>setBody(e.target.value)}/></label>
        <label>Source title · optional<input maxLength={200} value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)}/></label><label>Source HTTPS URL · optional<input type="url" maxLength={2000} value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/></label>
        <label className="check"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/>Display anonymously · accountable backend ownership remains private</label><button disabled={busy||body.trim().length<3}>Publish publicly</button>
      </form>}
    </>}
  </section>;
}

// The root of Community (no topic): the title row with Search topics and You, three segments, and the footnote.
function CommunityRoot({verse,online}: {verse:DailyContent;online:boolean}) {
  const {state}=usePlatform();
  const {session}=useAuth();
  const [segment,setSegmentState]=useState<Segment>(lastSegment);
  const [sheet,setSheet]=useState<"search"|"following"|"saved"|null>(null);
  const searchButton=useRef<HTMLButtonElement>(null);
  const setSegment=(next:Segment)=>{lastSegment=next;setSegmentState(next);};
  const saved=state.savedDiscussions.filter(id=>state.savedDiscussionTopics[id]);
  const followed=topicGraph.filter(t=>state.followedTopics.includes(t.id));
  const mine=!!session||!!state.followedTopics.length||!!state.savedDiscussions.length;
  return <section className="grouped-screen community">
    <TitleRow title="Community" actions={<button type="button" className="tool-button" aria-label="Search topics" ref={searchButton} onClick={()=>setSheet("search")}><Search size={22} aria-hidden="true" focusable="false"/></button>}/>
    <Segmented label="Community sections" value={segment} onChange={setSegment} options={segments}/>
    {segment==="topics"?<>
      <h2 className="sr-only">Topics</h2>
      {mine&&<GroupedList>
        <Row title="Following" value={state.followedTopics.length} chevron onClick={()=>setSheet("following")}/>
        <Row title="Saved" value={saved.length} chevron onClick={()=>setSheet("saved")}/>
      </GroupedList>}
      <GroupedList>{launchTopics.map(t=><Row key={t.id} title={t.label} href={"/community/"+t.id} chevron/>)}</GroupedList>
      <details className="group-disclosure">
        <summary>Live chat</summary>
        <Community only="chat" verse={verse} online={online}/>
      </details>
    </>:segment==="circles"?<>
      <h2 className="sr-only">Circles</h2>
      <CircleRows/>
    </>:<>
      <h2 className="sr-only">Prayer wall</h2>
      <Feed initialKind="prayer" composerType="prayer" heading="Prayer and praise"/>
      <details className="group-disclosure">
        <summary>The original prayer wall</summary>
        <Community only="prayer" verse={verse} online={online}/>
      </details>
    </>}
    <p className="screen-meta">Scripture, practical help and encouragement. Experience shared here is not verified expertise.</p>
    {sheet==="search"&&<TopicSearchSheet followed={followed} returnFocus={()=>searchButton.current} onClose={()=>setSheet(null)}/>}
    {sheet==="following"&&<Sheet title="Following" detent="large" onClose={()=>setSheet(null)}>
      <p className="sheet-body-text">Topics you chose to follow in this private local profile. Following does not publish membership.</p>
      {followed.length?<GroupedList>{followed.map(t=><Row key={t.id} title={t.label} href={"/community/"+t.id} chevron/>)}</GroupedList>:<p className="sheet-body-text">No followed topics yet.</p>}
    </Sheet>}
    {sheet==="saved"&&<Sheet title="Saved" detent="large" onClose={()=>setSheet(null)}>
      <p className="sheet-body-text">Private links on this device. Opening a saved thread rechecks its visibility; removed or blocked content is unavailable.</p>
      {saved.length?<GroupedList>{saved.map(id=><Row key={id} title={"Saved discussion · "+findTopic(state.savedDiscussionTopics[id])?.label} href={"/community/"+state.savedDiscussionTopics[id]+"?thread="+id} chevron/>)}</GroupedList>:<p className="sheet-body-text">No saved discussions yet.</p>}
    </Sheet>}
  </section>;
}

// Search topics: a sheet with one labelled field, as the Bible's search (UI-SPEC A2, A3). It looks through the launch
// topics and the topics the reader follows, in memory on this device; nothing is sent anywhere. The other topics stay
// resolvable by address but unlisted (CLAUDE.md).
function TopicSearchSheet({followed,returnFocus,onClose}: {followed:readonly {id:string;label:string}[];returnFocus:()=>HTMLElement|null;onClose:()=>void}) {
  const id=useId();
  const [text,setText]=useState("");
  const [searched,setSearched]=useState<string|null>(null);
  const query=(searched??"").trim().toLowerCase();
  const pool=[...launchTopics,...followed.filter(f=>!launchTopics.some(l=>l.id===f.id))];
  const results=query?pool.filter(t=>t.label.toLowerCase().includes(query)):[];
  return <Sheet title="Search topics" detent="large" onClose={onClose} returnFocus={returnFocus}>
    <form className="search-form" role="search" onSubmit={e=>{e.preventDefault();setSearched(text);}}>
      <label htmlFor={id+"-field"} className="sheet-label">Words to find</label>
      <div className="search-line">
        <input id={id+"-field"} type="search" enterKeyHint="search" autoComplete="off" autoCapitalize="none" spellCheck={false} value={text} aria-describedby={id+"-hint"} onChange={e=>setText(e.target.value)}/>
        <button type="submit">Search</button>
      </div>
      <p id={id+"-hint"} className="sheet-hint">Looks through the topics on this list and the ones you follow. The search runs on this device.</p>
    </form>
    <div role="status" className="search-status">
      {searched!==null&&!query?"Type a word to search.":null}
      {query&&!results.length?`No topics found for “${searched!.trim()}”. Check the spelling, or try one word.`:null}
      {results.length?`${results.length===1?"1 topic":results.length+" topics"} with “${searched!.trim()}”.`:null}
    </div>
    {results.length>0&&<GroupedList>{results.map(t=><Row key={t.id} title={t.label} href={"/community/"+t.id} chevron/>)}</GroupedList>}
  </Sheet>;
}
