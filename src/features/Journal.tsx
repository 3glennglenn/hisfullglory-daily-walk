import { useState } from "react";
import { usePlatform } from "../platform/store";
import type { JournalEntry, JournalType } from "../platform/models";
import { localDate } from "../storage";
import { navigate } from "../platform/router";
import { ShareForm } from "../social/Feed";
export interface JournalRepository {
  list(): JournalEntry[];
  save(entry: JournalEntry): boolean;
  remove(id: string): boolean;
}
export const journalTypes: JournalType[] = [
  "free journal",
  "Bible passage",
  "devotional",
  "prayer",
  "study note",
  "answered prayer",
];
export function JournalLibrary() {
  const { state, update } = usePlatform();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const entry = state.entries.find((e) => e.id === selected);
  const shared = state.entries.find((e) => e.id === sharing);
  const repository: JournalRepository = {
    list: () => state.entries,
    save(e) {
      return update((s) => ({
        ...s,
        entries: s.entries.map((x) => (x.id === e.id ? e : x)),
        local: e.id.startsWith("legacy:")
          ? { ...s.local, journals: { ...s.local.journals, [e.date]: e.body } }
          : s.local,
      }));
    },
    remove(id) {
      return update((s) => {
        const old = s.entries.find((e) => e.id === id);
        const journals = { ...s.local.journals };
        if (old?.id.startsWith("legacy:")) delete journals[old.date];
        return {
          ...s,
          entries: s.entries.filter((e) => e.id !== id),
          local: { ...s.local, journals },
        };
      });
    },
  };
  function add() {
    const e: JournalEntry = {
      id: crypto.randomUUID(),
      type: "free journal",
      title: "",
      body: "",
      date: localDate(),
    };
    if (update((s) => ({ ...s, entries: [e, ...s.entries] })))
      setSelected(e.id);
  }
  return (
    <section>
      <p className="eyebrow">A private place to listen</p>
      <h1>Your journal.</h1>
      <p>
        Saved only on this device. Cloud encryption and sync are not configured.
        Export a backup before clearing browser data.
      </p>
      <button onClick={add}>New entry</button>
      <div className="row">
        <input
          type="search"
          aria-label="Search private journal"
          placeholder="Search your entries"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter journal type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All entries</option>
          {journalTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {entry && (
        <article className="card">
          <h2>Edit private entry</h2>
          <label>
            Title
            <input
              maxLength={120}
              value={entry.title}
              onChange={(e) =>
                setStatus(
                  repository.save({ ...entry, title: e.target.value })
                    ? "Saved privately."
                    : "Not saved.",
                )
              }
            />
          </label>
          <label>
            Type
            <select
              aria-label="Type"
              value={entry.type}
              onChange={(e) =>
                repository.save({
                  ...entry,
                  type: e.target.value as JournalType,
                })
              }
            >
              {journalTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Your words
            <textarea
              rows={9}
              maxLength={10000}
              value={entry.body}
              onChange={(e) =>
                setStatus(
                  repository.save({ ...entry, body: e.target.value })
                    ? "Saved privately."
                    : "Not saved.",
                )
              }
            />
          </label>
          {entry.source && (
            <button
              className="text-button"
              onClick={() => navigate(entry.source!)}
            >
              Open attached source
            </button>
          )}
          <div className="actions">
            <button className="secondary" onClick={() => setSelected(null)}>
              Close
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (
                  window.confirm("Delete this private entry?") &&
                  repository.remove(entry.id)
                )
                  setSelected(null);
              }}
            >
              Delete entry
            </button>
            <button onClick={() => setSharing(entry.id)}>
              Choose to share publicly…
            </button>
          </div>
          <small role="status">{status}</small>
        </article>
      )}
      {shared && (
        <>
          <ShareForm
            initial={shared.body}
            source={shared.source}
            onDone={() => setSharing(null)}
          />
          <button className="secondary" onClick={() => setSharing(null)}>
            Keep private / cancel sharing
          </button>
        </>
      )}
      {repository
        .list()
        .filter(
          (e) =>
            (type === "all" || e.type === type) &&
            `${e.title} ${e.body}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((e) => (
          <button
            className="card entry"
            key={e.id}
            onClick={() => setSelected(e.id)}
          >
            <span className="eyebrow">
              {e.type} · {e.date}
            </span>
            <strong>{e.title || "Untitled reflection"}</strong>
            <span>{e.body.slice(0, 140) || "Start writing…"}</span>
          </button>
        ))}
      {!state.entries.length && (
        <div className="card">
          <h2>Begin with one honest sentence</h2>
          <p>
            What are you grateful for, and what do you want to bring to God?
          </p>
        </div>
      )}
    </section>
  );
}
