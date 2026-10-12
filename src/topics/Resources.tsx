import { usePlatform } from "../platform/store";
import { recommendResources } from "./graph";
import { navigate } from "../platform/router";
export function Resources() {
  const {state} = usePlatform();
  const resources = recommendResources(state.privateTopics,state.followedTopics);
  return <section className="card"><h2>Scripture and a next step</h2>
    <p>Suggestions are prepared on this device from your chosen topics. Journal and prayer text are never scanned.</p>
    {state.privateTopics.some(id=>["addiction","drugs","alcohol","anxiety"].includes(id))&&<p>If you are in immediate danger, contact local emergency services or a trusted person who can help you reach safety. Community encouragement does not replace qualified medical, mental-health or addiction support.</p>}
    {resources.map(r => <button className="text-button" key={r.id} onClick={() => navigate(r.path)}>{r.kind} · {r.title}</button>)}
    <details><summary>Why these suggestions?</summary><p>Only your explicit private preferences and followed topics are used. With no topics selected, we suggest the Growing closer to God journey. Popularity is not theological or professional authority.</p></details>
  </section>;
}
