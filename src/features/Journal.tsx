import { useState } from "react";
import { usePlatform } from "../platform/store";
import type { JournalEntry, JournalType } from "../platform/models";
import { localDate } from "../storage";
import { navigate } from "../platform/router";
import { ShareForm } from "../social/Feed";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle, Toolbar } from "../ui/Screen";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const shownEntries = repository
    .list()
    .filter(
      (e) =>
        (type === "all" || e.type === type) &&
        `${e.title} ${e.body}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>Your journal.</LargeTitle>
      <p className="screen-lede">
        Saved only on this device. Cloud encryption and sync are not configured.
        Export a backup before clearing browser data.
      </p>
      <button className="screen-action" onClick={add}>
        New entry
      </button>
      <GroupedList plain>
        <div className="group-pad field-pair">
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
      </GroupedList>
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
            <button className="secondary" aria-label="Close entry" onClick={() => setSelected(null)}>
              Close
            </button>
            <button className="secondary" onClick={() => setConfirmDelete(true)}>
              Delete entry
            </button>
            <button onClick={() => setSharing(entry.id)}>
              Choose to share publicly…
            </button>
          </div>
          <small role="status">{status}</small>
        </article>
      )}
      {entry && confirmDelete && (
        <ConfirmDialog
          title="Delete this private entry?"
          body="It is removed from this device. This cannot be undone."
          actionLabel="Delete entry"
          safeLabel="Keep entry"
          destructive
          onAction={() => {
            setConfirmDelete(false);
            // A write that fails is reported by the app's storage notice; the entry stays.
            if (repository.remove(entry.id)) setSelected(null);
          }}
          onSafe={() => setConfirmDelete(false)}
        />
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
      {shownEntries.length > 0 && (
        <GroupedList>
          {shownEntries.map((e) => (
            <Row
              key={e.id}
              title={e.title || "Untitled reflection"}
              detail={
                <>
                  <span className="row-line">
                    {e.type} · {e.date}
                  </span>
                  <span className="row-line">{e.body.slice(0, 140) || "Start writing…"}</span>
                </>
              }
              chevron
              onClick={() => setSelected(e.id)}
            />
          ))}
        </GroupedList>
      )}
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
