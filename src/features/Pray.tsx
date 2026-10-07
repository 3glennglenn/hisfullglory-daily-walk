import { useState } from "react";
import { usePlatform } from "../platform/store";
import { prayerTransition, type PrayerStatus } from "../platform/models";
import { localDate } from "../storage";
import { ShareForm, Feed } from "../social/Feed";
export function Pray() {
  const { state, update } = usePlatform();
  const [view, setView] = useState("private");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState("all");
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [sharing, setSharing] = useState<string | null>(null);
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
        setSharing(answer.trim());
        setShareType("testimony");
      }
      setAnswer("");
    }
  }
  return (
    <section>
      <p className="eyebrow">Bring your whole life to God</p>
      <h1>A life of prayer.</h1>
      <div className="tabs">
        <button
          aria-pressed={view === "private"}
          onClick={() => setView("private")}
        >
          Private prayers
        </button>
        <button
          aria-pressed={view === "public"}
          onClick={() => setView("public")}
        >
          Public prayer & praise
        </button>
      </div>
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
                    onClick={() => {
                      const text = window.prompt("A private prayer update");
                      if (text?.trim())
                        update((s) => ({
                          ...s,
                          prayers: s.prayers.map((x) =>
                            x.id === p.id
                              ? {
                                  ...x,
                                  updates: [
                                    ...x.updates,
                                    {
                                      date: localDate(),
                                      body: text.trim().slice(0, 10000),
                                    },
                                  ],
                                }
                              : x,
                          ),
                        }));
                    }}
                  >
                    Add private update
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const text = window.prompt(
                        "Edit your private prayer",
                        p.body,
                      );
                      if (text?.trim())
                        update((s) => ({
                          ...s,
                          prayers: s.prayers.map((x) =>
                            x.id === p.id
                              ? { ...x, body: text.trim().slice(0, 10000) }
                              : x,
                          ),
                        }));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (window.confirm("Delete this private prayer?"))
                        update((s) => ({
                          ...s,
                          prayers: s.prayers.filter((x) => x.id !== p.id),
                        }));
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => {
                      setShareType(p.answer ? "testimony" : "prayer");
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
            <button disabled={!answer.trim()} onClick={() => answered()}>
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
            onDone={() => setSharing(null)}
          />
          <button className="secondary" onClick={() => setSharing(null)}>
            Keep private / cancel
          </button>
        </>
      )}
    </section>
  );
}
