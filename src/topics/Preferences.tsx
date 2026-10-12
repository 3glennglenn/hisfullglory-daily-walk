import { topicGraph } from "./graph";
export function TopicPreferences({selected,onChange}: {selected: string[]; onChange: (value: string[]) => void}) {
  return <details className="card"><summary>What are you walking through right now? · optional</summary>
    <p>This is private, stays in this local profile, and can be changed anytime. Selecting a topic does not join a community or publish it.</p>
    <div className="chips">{topicGraph.map(t => <button type="button" className="secondary" key={t.id} aria-pressed={selected.includes(t.id)} onClick={() => onChange(selected.includes(t.id) ? selected.filter(id => id!==t.id) : [...selected,t.id])}>{t.label}</button>)}</div>
    <button type="button" className="text-button" onClick={() => onChange([])}>Prefer not to say</button>
  </details>;
}
