import { usePlatform } from "../platform/store";
import { findTopic } from "../topics/graph";
import { Resources } from "../topics/Resources";
import { navigate } from "../platform/router";
export function MyWalk() {
  const {state} = usePlatform();
  return <section><p className="eyebrow">Private · this local profile</p><h1>My Walk</h1>
    <p>A place to return, not a measure of spiritual maturity. Nothing on this page is a public profile.</p>
    <div className="card"><h2>Current focus</h2><p>{state.privateTopics.map(id => findTopic(id)?.label).join(" · ") || "No private topics selected."}</p><button className="secondary" onClick={() => navigate("/settings")}>Change private preferences</button></div>
    <div className="card"><h2>Your rhythm</h2><p>{state.local.completedDates.length} Daily Walks · {state.reading.length} chapters read · {state.bookmarks.length} saved passages</p><button onClick={() => navigate("/walk")}>Continue today's walk</button></div>
    <div className="card"><h2>Prayer and reflection</h2>{["Active","Waiting","Answered","Archived"].map(status => <p key={status}>{status} · {state.prayers.filter(p => p.status===status).length}</p>)}<p>{state.entries.length} private journal entries</p><button className="secondary" onClick={() => navigate("/pray")}>Open private prayers</button><button className="secondary" onClick={() => navigate("/journal")}>Open private journal</button></div>
    <div className="card"><h2>Your journeys</h2>{Object.entries(state.devotionalProgress).map(([id,days]) => <button className="text-button" key={id} onClick={() => navigate("/grow/"+id)}>{id.replaceAll("-"," ")} · {days.length}/5</button>)}{!Object.keys(state.devotionalProgress).length && <p>No journey progress yet.</p>}</div>
    <div className="card"><h2>Your story</h2>{state.prayers.filter(p => p.status==="Answered").map(p => <p key={p.id}>{p.answeredAt?new Date(p.answeredAt).toLocaleDateString()+" · ":""}{p.title} · answered privately{p.testimonyIds?.length?" · testimony explicitly published":""}</p>)}{state.local.completedDates.slice(-7).map(date => <p key={date}>{date} · Daily Walk completed</p>)}</div>
    <div className="card"><h2>Paths and challenges</h2><p>{state.joinedChallenges.length} joined challenge(s) · {Object.values(state.pathProgress).reduce((n,steps)=>n+steps.length,0)} path steps recorded</p><button className="secondary" onClick={()=>navigate("/grow")}>Continue a path or challenge</button></div>
    <div className="card"><h2>Followed communities</h2>{state.followedTopics.map(id=><button className="text-button" key={id} onClick={()=>navigate("/community/"+id)}>{findTopic(id)?.label}</button>)}{!state.followedTopics.length&&<p>No followed topics yet.</p>}</div>
    <Resources />
  </section>;
}
