import { usePlatform } from "../platform/store";
import { navigate } from "../platform/router";

const paths = [
  {id:"return-to-scripture", title:"Return to Scripture", topic:"returning-to-god", steps:[
    {title:"Begin with a small reading", path:"/bible/psalms/121", prompt:"What invitation do you notice in these words?"},
    {title:"Bring an honest prayer", path:"/pray", prompt:"Name one hope or question privately. There is no required wording."},
    {title:"Reflect and choose a next step", path:"/journal", prompt:"Write what you want to carry into tomorrow."}]},
  {id:"walking-through-grief", title:"Walking through grief", topic:"grief", steps:[
    {title:"Make room for lament", path:"/bible/psalms/23", prompt:"Read slowly. You do not have to resolve your grief today."},
    {title:"Bring what feels heavy", path:"/pray", prompt:"You may write privately or simply pause. Seek appropriate support when needed."},
    {title:"Remember without pressure", path:"/journal", prompt:"Record a memory or a hope, if you wish."}]},
];
const challengeId = "seven-days-in-scripture";
export function Journeys() {
  const {state,update}=usePlatform();
  const joined=state.joinedChallenges.includes(challengeId);
  const complete=state.challengeProgress[challengeId]??[];
  return <section className="card"><h2>Spiritual paths and challenges</h2>
    <p>Optional editorial practices, saved privately in this profile. Completion records your choice; it does not measure faith or spiritual maturity.</p>
    {paths.map(path=><details key={path.id}><summary>{path.title} · {state.pathProgress[path.id]?.length??0}/3 steps</summary>
      {path.steps.map((step,index)=><article key={step.title}><h3>{step.title}</h3><p>{step.prompt}</p><div className="actions">
        <button className="secondary" onClick={()=>navigate(step.path)}>Open practice</button>
        <button disabled={state.pathProgress[path.id]?.includes(index)} onClick={()=>update(s=>({...s,pathProgress:{...s.pathProgress,[path.id]:[...new Set([...(s.pathProgress[path.id]??[]),index])]}}))}>{state.pathProgress[path.id]?.includes(index)?"Step complete":"Mark step complete"}</button>
      </div></article>)}
      <button className="secondary" onClick={()=>navigate("/community/"+path.topic)}>Explore related community</button>
    </details>)}
    <details><summary>Seven days in Scripture · {complete.length}/7 practices</summary>
      <p>Revisit three selected WEB chapters at your pace. This is a local personal challenge with no public leaderboard or promised reward. Leaving preserves your progress.</p>
      <button onClick={()=>update(s=>({...s,joinedChallenges:joined?s.joinedChallenges.filter(id=>id!==challengeId):[...s.joinedChallenges,challengeId]}))}>{joined?"Leave challenge":"Join challenge privately"}</button>
      {joined&&Array.from({length:7},(_,day)=><article key={day}><h3>Day {day+1}</h3><p>Read, pray, and notice one phrase you want to remember.</p><div className="actions">
        <button className="secondary" onClick={()=>navigate(["/bible/psalms/23","/bible/psalms/121","/bible/romans/8"][day%3])}>Read Scripture</button>
        <button className="secondary" onClick={()=>navigate("/journal")}>Reflect privately</button>
        <button disabled={complete.includes(day)} onClick={()=>update(s=>({...s,challengeProgress:{...s.challengeProgress,[challengeId]:[...new Set([...(s.challengeProgress[challengeId]??[]),day])]}}))}>{complete.includes(day)?"Practice complete":"Mark practice complete"}</button>
      </div></article>)}
    </details>
  </section>;
}
