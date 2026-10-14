import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import { useAuth, AuthPanel } from "../platform/auth";
import { postError } from "./blockedLanguage";
import { navigate } from "../platform/router";
import { SafetyControls, type TargetKind } from "./safety";
export interface Post {
  origin_kind: TargetKind;
  id: string;
  display_name: string;
  body: string;
  post_type: string;
  source_path: string | null;
  created_at: string;
  is_owner: boolean;
  prayer_status: string | null;
  amen_count: number;
  helped_count: number;
  praying_count: number;
}
export const postTypes = [
  "reflection",
  "testimony",
  "memory",
  "encouragement",
  "prayer",
] as const;
export function ShareForm({
  source,
  initial = "",
  initialType = "reflection",
  onDone,
}: {
  source?: string;
  initial?: string;
  initialType?: string;
  onDone?: (postId: string, postType: string) => void;
}) {
  const { session, accepted } = useAuth();
  const [body, setBody] = useState(initial);
  const [type, setType] = useState<string>(initialType);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function publish() {
    if (!supabase || busy || !accepted) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("publish_community_post", {
      post_body: body.trim(),
      post_kind: type,
      passage_path: source ?? null,
      anonymous,
    });
    setBusy(false);
    setStatus(
      error
        ? postError(error, "Could not publish. Check rules, profile, length and the 30-second posting interval.")
        : "Published to the community.",
    );
    if (!error) {
      setBody("");
      if (typeof data === "string") onDone?.(data,type);
    }
  }
  return (
    <section className="card">
      <h3>
        {source?.startsWith("/bible/")
          ? "What has this Scripture meant in your life?"
          : "Share with the community"}
      </h3>
      <p>
        Share only what you want to make public. Personal experiences are
        distinct from Bible study.
      </p>
      {!session || !accepted ? (
        <AuthPanel />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <label>
            Contribution
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {postTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Your words
            <textarea
              required
              minLength={3}
              maxLength={2000}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Publish anonymously (moderators retain ownership)
          </label>
          <button disabled={busy || body.trim().length < 3}>
            Publish publicly
          </button>
        </form>
      )}
      <small role="status">{status}</small>
    </section>
  );
}
export function Feed({
  source,
  composer = true,
  initialKind = "all",
  composerType = "reflection",
}: {
  source?: string;
  composer?: boolean;
  initialKind?: string;
  composerType?: string;
}) {
  const { session } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [kind, setKind] = useState(initialKind);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const changed = () => setRevision((r) => r + 1);
    window.addEventListener("hfg-blocks-changed", changed);
    return () => {
      sequence.current++;
      window.removeEventListener("hfg-blocks-changed", changed);
    };
  }, []);
  async function load(append = false) {
    if (!supabase) return;
    const request = ++sequence.current;
    setBusy(true);
    const { data, error } = await supabase.rpc("read_aggregate_feed", {
      source_filter: source ?? null,
      kind_filter: kind === "all" ? null : kind,
      before_time: append ? posts.at(-1)?.created_at : null,
      before_id: append ? posts.at(-1)?.id : null,
    });
    if (request !== sequence.current) return;
    setBusy(false);
    if (error) {
      setError(
        "Community is unavailable. Apply the platform migration and try again.",
      );
      return;
    }
    const rows = (data ?? []) as Post[];
    setPosts(append ? [...posts, ...rows] : rows);
    setMore(rows.length === 20);
    setError("");
  }
  useEffect(() => {
    setPosts([]);
    void load();
  }, [source, kind, session?.user.id, revision]);
  async function remove(id: string, origin: TargetKind) {
    if (!supabase || !window.confirm("Delete this public contribution?"))
      return;
    const { error } =
      origin === "post"
        ? await supabase.rpc("delete_community_post", { post_id: id })
        : await supabase
            .from(origin === "chat" ? "chat_messages" : "prayer_posts")
            .delete()
            .eq("id", id);
    if (error) setError("Deletion failed.");
    else setRevision((r) => r + 1);
  }
  async function react(id: string, reaction: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc("react_community_post", {
      post_id: id,
      reaction_name: reaction,
    });
    if (error) setError("Sign in to react.");
    else setRevision((r) => r + 1);
  }
  async function updatePrayer(id: string, status: string) {
    const answer =
      status === "Answered"
        ? window.prompt(
            "How did God answer your prayer? This update will be public.",
          )
        : window.prompt("Add a public prayer update (optional).");
    if (answer === null) return;
    if (!supabase) return;
    const { error } = await supabase.rpc("update_public_prayer", {
      post_id: id,
      new_status: status,
      update_body: answer ?? "",
    });
    if (error) setError("Prayer update could not be saved.");
    else setRevision((r) => r + 1);
  }
  return (
    <section>
      <h2>{source ? "Community reflections" : "Faith in everyday life"}</h2>
      {composer && (
        <ShareForm
          initialType={composerType}
          source={source}
          onDone={() => setRevision((r) => r + 1)}
        />
      )}
      <label>
        Show
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All contributions</option>
          {[...postTypes, "chat"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      {!supabase ? (
        <div className="card">
          <p>
            Public contributions are unavailable until Supabase is configured.
            Your private writing remains on your device.
          </p>
        </div>
      ) : (
        <>
          <p role="status">
            {error ||
              (busy
                ? "Loading…"
                : posts.length
                  ? ""
                  : "No contributions here yet.")}
          </p>
          {posts.map((p) => (
            <article className="card" key={p.id}>
              <div className="row">
                <strong>{p.display_name}</strong>
                <small>
                  {p.post_type} · {new Date(p.created_at).toLocaleDateString()}
                </small>
              </div>
              {p.source_path && (
                <button
                  className="text-button"
                  onClick={() => navigate(p.source_path!)}
                >
                  Read the source
                </button>
              )}
              <p className="preserve">{p.body}</p>
              {p.prayer_status && <p>Prayer · {p.prayer_status}</p>}
              <div className="actions">
                {(p.origin_kind === "post"
                  ? (["amen", "helped", "praying"] as const)
                  : []
                ).map((r) => (
                  <button
                    key={r}
                    className="secondary"
                    disabled={!session}
                    onClick={() => void react(p.id, r)}
                  >
                    {r === "helped"
                      ? "This helped me"
                      : r === "praying"
                        ? "Praying"
                        : "Amen"}{" "}
                    · {p[`${r}_count`]}
                  </button>
                ))}
              </div>
              {p.is_owner && (
                <div className="actions">
                  <button
                    className="text-button"
                    onClick={() => void remove(p.id, p.origin_kind)}
                  >
                    Delete my contribution
                  </button>
                  {p.post_type === "prayer" && p.origin_kind === "post" && (
                    <label>
                      Prayer state
                      <select
                        value={p.prayer_status ?? "Active"}
                        onChange={(e) =>
                          void updatePrayer(p.id, e.target.value)
                        }
                      >
                        {["Active", "Waiting", "Answered", "Archived"].map(
                          (s) => (
                            <option key={s}>{s}</option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <SafetyControls
                id={p.id}
                kind={p.origin_kind}
                onChange={() => setRevision((r) => r + 1)}
              />
            </article>
          ))}
          {more && (
            <button
              disabled={busy}
              className="secondary"
              onClick={() => void load(true)}
            >
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
