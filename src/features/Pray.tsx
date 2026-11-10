import { useRef, useState } from "react";
import { usePlatform } from "../platform/store";
import { prayerTransition, type PrayerStatus } from "../platform/models";
import { localDate } from "../storage";
import { ShareForm } from "../social/Feed";
import { cameFrom } from "../platform/router";
import { LargeTitle, Toolbar } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TextSheet } from "../ui/TextSheet";
export function Pray() {
  const { state, update } = usePlatform();
  // The New prayer sheet. What was typed in it stays in this component while the screen is open (never stored).
  const [composing, setComposing] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  // The private prayer a reader is updating, editing or deleting, in the app's own sheet (UI-SPEC A15).
  const [sheet, setSheet] = useState<{ kind: "update" | "edit" | "delete"; id: string } | null>(null);
  const target = sheet ? state.prayers.find((p) => p.id === sheet.id) : undefined;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState("all");
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [sharing, setSharing] = useState<string | null>(null);
  const [sharingPrayerId,setSharingPrayerId] = useState<string|null>(null);
  const [shareType, setShareType] = useState("prayer");
  const [status, setStatus] = useState("");
  function answered(share = false) {
    const p = state.prayers.find((p) => p.id === answerId);
    if (!p || !answer.trim()) return;
    if (
      update((s) => ({
        ...s,
        prayers: s.prayers.map((x) =>
          x.id === p.id ? prayerTransition(x, "Answered", answer) : x,
        ),
        entries: [
          {
            id: crypto.randomUUID(),
            type: "answered prayer",
            title: p.title,
            body: answer.trim(),
            date: localDate(),
          },
          ...s.entries,
        ],
      }))
    ) {
      setAnswerId(null);
      if (share) {
        setSharingPrayerId(p.id);
        setSharing(answer.trim());
        setShareType("testimony");
      }
      setAnswer("");
    }
  }
  const prayers = state.prayers.filter((p) => filter === "all" || p.status === filter);
  // Back names where the reader came from: Today's walk (its prayer step), My walk, otherwise You.
  const from = cameFrom();
  const parent = from === "/walk" ? { back: "Today's walk", to: "/walk" } : from === "/my-walk" ? { back: "My walk", to: "/my-walk" } : { back: "You", to: "/you" };
  return (
    <section className="grouped-screen pray">
      <Toolbar back={parent.back} to={parent.to} />
      <LargeTitle>My prayers</LargeTitle>
      {!state.prayers.length && (
        <p className="screen-lede">Your prayers stay on this device. Write the first one when you are ready.</p>
      )}
      {!!state.prayers.length && (
        <Segmented
          label="Prayer filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "Active", label: "Active" },
            { value: "Waiting", label: "Waiting" },
            { value: "Answered", label: "Answered" },
          ]}
        />
      )}
      <button type="button" className="screen-action" ref={newButton} onClick={() => setComposing(true)}>
        New prayer
      </button>
      <p className="screen-meta" role="status">
        {status}
      </p>
      {!!state.prayers.length && !prayers.length && <p>Nothing here yet.</p>}
      {prayers.map((p) => (
        <article className="card" key={p.id}>
          <small>
            {p.status} · {new Date(p.createdAt).toLocaleDateString()}
          </small>
          <h2>{p.title}</h2>
          <p className="preserve">{p.body}</p>
          {p.answer && (
            <>
              <h3>How God answered</h3>
              <p className="preserve">{p.answer}</p>
            </>
          )}
          {!!p.testimonyIds?.length&&<p>{p.testimonyIds.length} explicitly published testimony link(s) saved privately. Public posts can be removed independently.</p>}
          {p.updates.map((u, i) => (
            <p key={i}>
              <small>{u.date}</small> {u.body}
            </p>
          ))}
          <div className="actions">
            <label>
              Move to
              <select
                value={p.status}
                onChange={(e) => {
                  const next = e.target.value as PrayerStatus;
                  if (next === "Answered") {
                    setAnswerId(p.id);
                    setAnswer(p.answer);
                  } else
                    update((s) => ({
                      ...s,
                      prayers: s.prayers.map((x) =>
                        x.id === p.id ? prayerTransition(x, next) : x,
                      ),
                    }));
                }}
              >
                {["Active", "Waiting", "Answered", "Archived"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
            <button
              className="secondary"
              onClick={() => setSheet({ kind: "update", id: p.id })}
            >
              Add private update
            </button>
            <button
              className="secondary"
              onClick={() => setSheet({ kind: "edit", id: p.id })}
            >
              Edit
            </button>
            <button
              className="secondary"
              onClick={() => setSheet({ kind: "delete", id: p.id })}
            >
              Delete
            </button>
            <button
              className="secondary"
              onClick={() => {
                setShareType(p.answer ? "testimony" : "prayer");
                setSharingPrayerId(p.id);
                setSharing(p.answer || p.body);
              }}
            >
              Choose to share…
            </button>
          </div>
        </article>
      ))}
      {!!state.prayers.length && (
        <p className="screen-meta">
          Your prayers can stay entirely private. Nothing is uploaded automatically.
        </p>
      )}
      {composing && (
        <Sheet title="New prayer" detent="large" returnFocus={() => newButton.current} onClose={() => setComposing(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Local state only: the prayer is written to this device and goes nowhere else.
              if (
                update((s) => ({
                  ...s,
                  prayers: [
                    {
                      id: crypto.randomUUID(),
                      title: title.trim(),
                      body: body.trim(),
                      status: "Active",
                      answer: "",
                      updates: [],
                      createdAt: new Date().toISOString(),
                    },
                    ...s.prayers,
                  ],
                }))
              ) {
                setTitle("");
                setBody("");
                setFilter("all");
                setStatus("Saved privately on this device.");
                setComposing(false);
              }
            }}
          >
            <label htmlFor="new-prayer-title" className="sheet-label">
              Title
            </label>
            <input
              id="new-prayer-title"
              required
              maxLength={120}
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label htmlFor="new-prayer-body" className="sheet-label">
              Prayer
            </label>
            <textarea
              id="new-prayer-body"
              className="sheet-field"
              required
              maxLength={10000}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="sheet-hint">Saved on this device only. Nothing is uploaded.</p>
            <div className="sheet-actions">
              <button type="submit">Save private prayer</button>
            </div>
          </form>
        </Sheet>
      )}
      {target && sheet?.kind === "update" && (
        <TextSheet
          title="A private prayer update"
          fieldLabel="Your update"
          draftKey={`prayer-update:${target.id}`}
          safeLabel="Don't save update"
          actionLabel="Save update"
          busyLabel="Saving…"
          // A write that fails is reported by the app's storage notice; the typed words are kept.
          onAction={(text) =>
            update((s) => ({
              ...s,
              prayers: s.prayers.map((x) =>
                x.id === target.id
                  ? {
                      ...x,
                      updates: [...x.updates, { date: localDate(), body: text.trim().slice(0, 10000) }],
                    }
                  : x,
              ),
            }))
          }
          onSafe={() => setSheet(null)}
        />
      )}
      {target && sheet?.kind === "edit" && (
        <TextSheet
          title="Edit your private prayer"
          fieldLabel="Your prayer"
          initialText={target.body}
          draftKey={`prayer-edit:${target.id}`}
          safeLabel="Keep the original"
          actionLabel="Save changes"
          busyLabel="Saving…"
          onAction={(text) =>
            update((s) => ({
              ...s,
              prayers: s.prayers.map((x) =>
                x.id === target.id ? { ...x, body: text.trim().slice(0, 10000) } : x,
              ),
            }))
          }
          onSafe={() => setSheet(null)}
        />
      )}
      {target && sheet?.kind === "delete" && (
        <ConfirmDialog
          title="Delete this private prayer?"
          body="It is removed from this device. This cannot be undone."
          actionLabel="Delete prayer"
          safeLabel="Keep prayer"
          destructive
          onAction={() => {
            setSheet(null);
            update((s) => ({ ...s, prayers: s.prayers.filter((x) => x.id !== target.id) }));
          }}
          onSafe={() => setSheet(null)}
        />
      )}
      {answerId && (
        <div className="card">
          <h2>How did God answer your prayer?</h2>
          <textarea
            maxLength={10000}
            rows={5}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="actions">
            <button
              disabled={!answer.trim()}
              className="secondary"
              onClick={() => answered()}
            >
              Keep private
            </button>
            <button
              disabled={!answer.trim()}
              className="secondary"
              onClick={() => answered(true)}
            >
              Share testimony…
            </button>
            <button className="secondary" onClick={() => setAnswerId(null)}>
              Cancel
            </button>
          </div>
          <small>
            Sharing opens a separate public composer. You must publish
            explicitly.
          </small>
        </div>
      )}
      {sharing !== null && (
        <>
          <ShareForm
            initial={sharing}
            initialType={shareType}
            onDone={(postId,postType) => {
              if(sharingPrayerId&&postType==="testimony") update(s=>({...s,prayers:s.prayers.map(p=>p.id===sharingPrayerId?{...p,testimonyIds:[...new Set([...(p.testimonyIds??[]),postId])]}:p)}));
              setSharing(null);setSharingPrayerId(null);
            }}
          />
          <button className="secondary" onClick={() => setSharing(null)}>
            Keep private / cancel
          </button>
        </>
      )}
    </section>
  );
}
