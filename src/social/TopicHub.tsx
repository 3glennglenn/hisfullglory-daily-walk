import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../platform/auth";
import { postError } from "./blockedLanguage";
import { usePlatform } from "../platform/store";
import { navigate } from "../platform/router";
import { findTopic, launchTopics, topicGraph } from "../topics/graph";
import { SafetyControls } from "./safety";
import { Feed, postTypes } from "./Feed";
import { safeSourceUrl } from "./sources";
interface Discussion {
  id:string; display_name:string; body:string; post_type:string; created_at:string;
  is_owner:boolean; score:number; upvotes:number; voted:boolean; helped:number;
  reputation:number|null; replies:number; sources:{title:string;url:string}[];
}
export function TopicHub({id,thread}: {id?:string;thread?:string}) {
  const {state,update}=usePlatform();
  const {session,accepted}=useAuth();
  const [tab,setTab]=useState("Topics");
  const [query,setQuery]=useState("");
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
  if(!topic) return <section><h1>Walk together.</h1><p>Scripture, practical help and encouragement. Community experience and reputation are not verified expertise.</p>
    <button className="secondary" onClick={()=>navigate("/community/circles")}>Circles · walk together</button>
    <div className="tabs">{["Topics","Following","Saved","Testimonies","Community feed"].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==="Saved"?<><p>Private links on this device. Opening a saved thread rechecks its visibility; removed or blocked content is unavailable.</p>{state.savedDiscussions.filter(id=>state.savedDiscussionTopics[id]).map(id=><button className="card entry" key={id} onClick={()=>navigate("/community/"+state.savedDiscussionTopics[id]+"?thread="+id)}>Saved discussion · {findTopic(state.savedDiscussionTopics[id])?.label}</button>)}{!state.savedDiscussions.length&&<p>No saved discussions yet.</p>}</>:tab==="Community feed"?<Feed/>:tab==="Testimonies"?<Feed initialKind="testimony"/>:<>
      <label>Search topics<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      {tab==="Following" && <p>Topics you chose to follow in this private local profile. Following does not publish membership.</p>}
      {(tab==="Following"?topicGraph:launchTopics).filter(t=>(tab!=="Following"||state.followedTopics.includes(t.id))&&t.label.toLowerCase().includes(query.toLowerCase())).map(t=><button className="card entry" key={t.id} onClick={()=>navigate("/community/"+t.id)}><strong>{t.label}</strong><span>Scripture · practical encouragement · discussions</span></button>)}
      {tab==="Following"&&!state.followedTopics.length&&<p>No followed topics yet.</p>}
    </>}
  </section>;
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
          {p.is_owner&&<button className="secondary" disabled={busy} onClick={()=>{if(confirm("Delete this public contribution?"))void action("delete_community_post",{post_id:p.id});}}>Delete my contribution</button>}
        </div><SafetyControls id={p.id} kind="post" onChange={()=>setRevision(n=>n+1)}/></article>)}
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
