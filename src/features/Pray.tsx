import { useState } from "react";
import { usePlatform } from "../platform/store";
import { prayerTransition, type PrayerStatus } from "../platform/models";
import { localDate } from "../storage";
import { ShareForm, Feed } from "../social/Feed";
import { LargeTitle } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TextSheet } from "../ui/TextSheet";
export function Pray() {
  const { state, update } = usePlatform();
  const [view, setView] = useState<"private" | "public">("private");
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
  return (
    <section className="grouped-screen pray">
      <LargeTitle>Pray</LargeTitle>
      <p className="screen-lede">Bring your whole life to God</p>
      <Segmented
        label="Prayer views"
        value={view}
        onChange={setView}
        options={[
          { value: "private", label: "Private prayers" },
          { value: "public", label: "Prayer and praise" },
        ]}
      />
      {view === "public" ? (
        <Feed initialKind="prayer" composerType="prayer" />
      ) : (
        <>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
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
                setStatus("Saved privately on this device.");
              }
            }}
          >
            <h2>Your private prayer</h2>
            <label>
              Title
              <input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Prayer
              <textarea
                required
                maxLength={10000}
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <button>Save private prayer</button>
            <small role="status">{status}</small>
          </form>
          <label>
            Prayer state
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All prayers</option>
              {["Active", "Waiting", "Answered", "Archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {state.prayers
            .filter((p) => filter === "all" || p.status === filter)
            .map((p) => (
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
          {!state.prayers.length && (
            <p>
              Your prayers can stay entirely private. Nothing is uploaded
              automatically.
            </p>
          )}
        </>
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
