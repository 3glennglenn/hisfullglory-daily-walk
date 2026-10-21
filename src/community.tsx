import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { Heart, MessageCircle, Send, Shield, Trash2 } from "lucide-react";
import { supabase } from "./supabase";
import {
  CodeEntry,
  SignInNote,
  codeSentStatus,
} from "./platform/CodeEntry";
import { codeFailureMessage } from "./platform/googleSignIn";
import { postError } from "./social/blockedLanguage";
import { useAuth, AuthPanel } from "./platform/auth";
import { SafetyControls } from "./social/safety";
import { track } from "./analytics";
import type { DailyContent } from "./data";

interface Room {
  id: string;
  slug: string;
  name: string;
  description: string;
}
interface Message {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}
interface Prayer {
  id: string;
  user_id: string | null;
  display_name: string;
  body: string;
  post_type: "prayer" | "testimony";
  is_anonymous: boolean;
  created_at: string;
  prayed_count: number;
  has_prayed: boolean;
}
const demoRooms: Room[] = [
  {
    id: "demo-1",
    slug: "general-fellowship",
    name: "General Fellowship",
    description: "Share encouragement for your everyday walk.",
  },
  {
    id: "demo-2",
    slug: "todays-scripture",
    name: "Today’s Scripture",
    description: "Reflect together on today’s verse.",
  },
  {
    id: "demo-3",
    slug: "prayer-praise",
    name: "Prayer & Praise",
    description: "Bring a prayer or share a moment of gratitude.",
  },
];
const demoMessages: Message[] = [
  {
    id: "example-1",
    room_id: "demo-1",
    user_id: "",
    display_name: "Grace · example",
    body: "I’m making a little room for Scripture before the day begins. What helps you return to your daily rhythm?",
    created_at: "2026-01-01T08:00:00Z",
  },
  {
    id: "example-2",
    room_id: "demo-1",
    user_id: "",
    display_name: "James · example",
    body: "A short passage and one honest prayer. Grateful for small beginnings.",
    created_at: "2026-01-01T08:05:00Z",
  },
];
const demoPrayers: Prayer[] = [
  {
    id: "example-prayer",
    user_id: null,
    display_name: "Anonymous · example",
    body: "Please pray for wisdom and kindness as our family begins a new season.",
    post_type: "prayer",
    is_anonymous: true,
    created_at: "2026-01-01T08:00:00Z",
    prayed_count: 0,
    has_prayed: false,
  },
];
export function validateCommunityText(body: string): string | null {
  const text = body.trim();
  if (!text || text.length > 500)
    return "Please write between 1 and 500 characters.";
  if (
    /(.)\1{14,}/u.test(text) ||
    (text.match(/https?:\/\//gi)?.length ?? 0) > 2 ||
    /\b(buy now|free crypto|porn|fuck|shit)\b/i.test(text)
  )
    return "Please remove spam or inappropriate language before posting.";
  return null;
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
const timestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function Guidelines({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog ref={dialog} onCancel={close} aria-labelledby="guidelines-title">
      <h2 id="guidelines-title">A kind, Christ-centered space</h2>
      <ul>
        <li>Be kind and Christ-centered.</li>
        <li>No harassment, hate, sexual content, spam, or sales promotion.</li>
        <li>Protect personal information.</li>
        <li>Do not post emergencies or sensitive medical details.</li>
        <li>Report concerning content.</li>
      </ul>
      <p>
        Basic text checks are not complete moderation. Posts are reviewed
        manually. Community prayer does not replace emergency, medical,
        mental-health, legal, or professional support.
      </p>
      <button onClick={close}>Close guidelines</button>
    </dialog>
  );
}

export function Community({
  verse,
  online,
}: {
  verse: DailyContent;
  online: boolean;
}) {
  const { accepted } = useAuth();
  const [view, setView] = useState<"chat" | "prayer">("chat");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [profile, setProfile] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState(false);
  const [email, setEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNote, setAuthNote] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [guidelines, setGuidelines] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const apply = (s: Session | null) => {
      if (alive) {
        setSession(s);
        setAuthLoading(false);
      }
    };
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        apply(data.session);
        if (alive && error)
          setAuthNote(
            "We could not restore your session. Please sign in again.",
          );
      })
      .catch(() => {
        apply(null);
        setAuthNote("We could not restore your session.");
      });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      apply(s);
      if (event === "SIGNED_IN") track("auth_completed");
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    setProfile("");
    setName("");
    setEditName(false);
    if (!supabase || !session) {
      setProfileLoading(false);
      return;
    }
    let alive = true;
    setProfileLoading(true);
    void supabase
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error)
          setAuthNote(
            "We could not load your display name. Please retry by signing in again.",
          );
        setProfile(data?.display_name ?? "");
        setName(data?.display_name ?? "");
        setProfileLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.user.id, accepted]);
  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || authBusy || !online) return;
    setAuthBusy(true);
    setAuthNote("");
    track("auth_started");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      setAuthNote(error ? codeFailureMessage(error) : codeSentStatus);
      if (!error) {
        setSentTo(email.trim());
        setSentAt(Date.now());
        setEmail("");
      }
    } catch {
      setAuthNote("Sign-in is unavailable right now. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };
  // Asking again for the same address resets the wait that CodeEntry counts down.
  const resendCode = async () => {
    if (!supabase) return false;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: sentTo,
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      if (!error) setSentAt(Date.now());
      return !error;
    } catch {
      return false;
    }
  };
  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !session || authBusy) return;
    if (
      name.trim().length < 2 ||
      name.trim().length > 40 ||
      validateCommunityText(name)
    ) {
      setAuthNote("Choose a respectful display name of 2–40 characters.");
      return;
    }
    setAuthBusy(true);
    setAuthNote("");
    try {
      const query = profile
        ? supabase
            .from("profiles")
            .update({ display_name: name.trim() })
            .eq("id", session.user.id)
        : supabase
            .from("profiles")
            .insert({ id: session.user.id, display_name: name.trim() });
      const { error, data } = await query.select("display_name").single();
      if (error || !data)
        setAuthNote("We could not save your name. Please try again.");
      else {
        setProfile(data.display_name);
        setEditName(false);
      }
    } catch {
      setAuthNote("We could not save your name. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };
  const canWrite =
    accepted &&
    !!supabase &&
    !!session &&
    !!profile &&
    !profileLoading &&
    online;
  return (
    <section aria-labelledby="community-title">
      {!accepted && <AuthPanel />}
      <div className="section-head">
        <div>
          <h2 id="community-title">Community</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Community guidelines"
          onClick={() => setGuidelines(true)}
        >
          <Shield size={22} />
        </button>
      </div>
      <p className="intro">
        A little encouragement for the journey. Be kind, protect personal
        information, and share with care.
      </p>
      {!supabase && (
        <aside className="notice">
          <strong>Community preview</strong>
          <p>
            These are read-only examples. Live conversation opens when Supabase
            is configured. Your daily walk is ready to use.
          </p>
        </aside>
      )}
      {supabase && (
        <div className="card auth-card">
          {authLoading ? (
            <p role="status">Restoring your session…</p>
          ) : session ? (
            <>
              <div className="row">
                <span>
                  {profileLoading
                    ? "Loading your name…"
                    : profile
                      ? `Welcome, ${profile}`
                      : "Choose your display name"}
                </span>
                <button
                  className="text-button"
                  disabled={authBusy}
                  onClick={async () => {
                    if (!supabase) return;
                    setAuthBusy(true);
                    try {
                      const { error } = await supabase.auth.signOut();
                      if (error)
                        setAuthNote("Sign-out failed. Please try again.");
                    } catch {
                      setAuthNote("Sign-out failed. Please try again.");
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                >
                  Sign out
                </button>
              </div>
              {profile && !editName && (
                <button
                  className="text-button"
                  onClick={() => setEditName(true)}
                >
                  Edit display name
                </button>
              )}
              {!profileLoading && (!profile || editName) && (
                <form onSubmit={saveName}>
                  <label htmlFor="display-name">Display name</label>
                  <input
                    id="display-name"
                    autoComplete="nickname"
                    minLength={2}
                    maxLength={40}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button disabled={authBusy || !online}>
                    {authBusy ? "Saving…" : "Save name"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <form onSubmit={signIn}>
              <label htmlFor="auth-email">
                Sign in to join the conversation
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button disabled={authBusy || !online}>
                {authBusy ? "Sending…" : "Email me a sign-in code"}
              </button>
              <SignInNote />
              <small>
                Guests are welcome to read. Your email is never displayed.
              </small>
            </form>
          )}
          {authNote && <p role="status">{authNote}</p>}
          {!session && sentTo && (
            <CodeEntry email={sentTo} sentAt={sentAt} onResend={resendCode} />
          )}
        </div>
      )}
      <div className="segments" aria-label="Community view">
        <button aria-pressed={view === "chat"} onClick={() => setView("chat")}>
          <MessageCircle size={17} />
          Community Chat
        </button>
        <button
          aria-pressed={view === "prayer"}
          onClick={() => setView("prayer")}
        >
          <Heart size={17} />
          Prayer Wall
        </button>
      </div>
      {view === "chat" ? (
        <Chat
          verse={verse}
          userId={session?.user.id}
          canWrite={canWrite}
          online={online}
        />
      ) : (
        <PrayerWall
          userId={session?.user.id}
          canWrite={canWrite}
          online={online}
        />
      )}
      {guidelines && <Guidelines close={() => setGuidelines(false)} />}
    </section>
  );
}

function Chat({
  verse,
  userId,
  canWrite,
  online,
}: {
  verse: DailyContent;
  userId?: string;
  canWrite: boolean;
  online: boolean;
}) {
  const [rooms, setRooms] = useState<Room[]>(supabase ? [] : demoRooms);
  const [roomId, setRoomId] = useState(supabase ? "" : demoRooms[0].id);
  const [reloadVersion, setReloadVersion] = useState(0);
  useEffect(() => {
    const changed = () => setReloadVersion((v) => v + 1);
    window.addEventListener("hfg-blocks-changed", changed);
    return () => window.removeEventListener("hfg-blocks-changed", changed);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(!!supabase);
  const [earlierBusy, setEarlierBusy] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState(
    supabase ? "Connecting…" : "Read-only preview",
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const last = useRef("");
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const currentRoom = useRef(roomId);
  currentRoom.current = roomId;
  const currentMessages = useRef(messages);
  currentMessages.current = messages;
  const room = rooms.find((r) => r.id === roomId);
  const shown = supabase ? messages : roomId === "demo-1" ? demoMessages : [];
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const getRooms = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: e } = await supabase
        .from("chat_rooms")
        .select("id,slug,name,description")
        .order("sort_order");
      if (e) throw e;
      setRooms(data ?? []);
      setRoomId((prev) =>
        data?.some((r) => r.id === prev) ? prev : (data?.[0]?.id ?? ""),
      );
      if (!data?.length)
        setError(
          "The conversation rooms are not available yet. Please check back soon.",
        );
    } catch {
      setError("We could not load the rooms. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void getRooms();
  }, [getRooms]);
  useEffect(() => {
    if (!supabase || !roomId) return;
    const client = supabase;
    let alive = true;
    setMessages([]);
    setLoading(true);
    setError("");
    nearBottom.current = true;
    let firstPage = true;
    const refresh = async () => {
      const { data, error: e } = await client
        .from("chat_messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (!alive) return;
      if (e)
        setError(
          "Messages could not be loaded. You can retry or keep using your daily walk.",
        );
      else {
        setMessages((prev) => mergeMessages(prev, (data ?? []).reverse()));
        if (firstPage) {
          setHasEarlier(data?.length === 50);
          firstPage = false;
        }
      }
      setLoading(false);
    };
    // Reconcile visible rows: moderation updates can disappear from RLS subscriptions.
    const reconcile = async () => {
      const ids = currentMessages.current.map((m) => m.id);
      if (ids.length) {
        const { data, error: e } = await client
          .from("chat_messages")
          .select("*")
          .eq("room_id", roomId)
          .in("id", ids);
        if (alive && !e) {
          const visible = new Map(
            ((data as Message[]) ?? []).map((m) => [m.id, m]),
          );
          setMessages((prev) =>
            prev
              .filter((m) => !ids.includes(m.id) || visible.has(m.id))
              .map((m) => visible.get(m.id) ?? m),
          );
        }
      }
    };
    const channel = client
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (!alive) return;
          if (payload.eventType === "INSERT") {
            const m = payload.new as Message & {
              deleted_at: string | null;
              is_hidden: boolean;
            };
            if (!m.deleted_at && !m.is_hidden)
              setMessages((prev) => mergeMessages(prev, [m]));
          } else void reconcile();
        },
      )
      .subscribe((status) => {
        if (!alive) return;
        setConnection(
          status === "SUBSCRIBED"
            ? "Live conversation"
            : status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
              ? "Reconnecting…"
              : "Connecting…",
        );
        if (status === "SUBSCRIBED") {
          void refresh();
          void reconcile();
        }
      });
    void refresh();
    const interval = setInterval(() => {
      void reconcile();
      void refresh();
    }, 20000);
    return () => {
      alive = false;
      clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [roomId, retry, online, reloadVersion]);
  useEffect(() => {
    if (nearBottom.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [shown.length, roomId]);
  const earlier = async () => {
    if (!supabase || !messages.length || earlierBusy) return;
    const selected = roomId;
    const first = messages[0];
    const height = feed.current?.scrollHeight ?? 0;
    setEarlierBusy(true);
    setError("");
    const { data, error: e } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("room_id", selected)
      .or(
        `created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`,
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);
    if (currentRoom.current !== selected) {
      setEarlierBusy(false);
      return;
    }
    if (e) setError("Earlier messages could not be loaded. Please try again.");
    else {
      nearBottom.current = false;
      setMessages((prev) => mergeMessages(prev, data ?? []));
      setHasEarlier(data?.length === 50);
      requestAnimationFrame(() => {
        if (feed.current)
          feed.current.scrollTop += feed.current.scrollHeight - height;
      });
    }
    setEarlierBusy(false);
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !canWrite || !userId || !room || lock.current || cooldown)
      return;
    const text = body.trim();
    const invalid = validateCommunityText(text);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (text === last.current) {
      setError("You have already sent that message. Share something new.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const selected = room.id;
    try {
      const { data, error: err } = await supabase
        .from("chat_messages")
        .insert({ room_id: selected, user_id: userId, body: text })
        .select("*")
        .single();
      if (err || !data) throw err;
      last.current = text;
      setCooldown(true);
      timer.current = setTimeout(() => setCooldown(false), 3000);
      if (currentRoom.current === selected) {
        setBody("");
        setMessages((prev) => mergeMessages(prev, [data as Message]));
      }
      track("chat_message_posted", { room: room.slug });
    } catch (e) {
      setError(postError(e, "Your message was not sent. Wait a few seconds and try again."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = async (m: Message) => {
    if (!supabase || m.user_id !== userId || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const { data, error: e } = await supabase
        .from("chat_messages")
        .delete()
        .eq("id", m.id)
        .eq("user_id", userId)
        .select("id");
      if (e || !data?.length) throw e;
      setMessages((prev) => prev.filter((row) => row.id !== m.id));
    } catch {
      setError("The message could not be deleted. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="chat">
      <label htmlFor="room-select">Conversation room</label>
      <select
        id="room-select"
        value={roomId}
        disabled={!rooms.length}
        onChange={(e) => {
          setRoomId(e.target.value);
          setBody("");
        }}
      >
        {!rooms.length && <option value="">Rooms unavailable</option>}
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <div className="room-heading">
        <h2>{room?.name ?? "Conversation"}</h2>
        <p>{room?.description}</p>
        <small role="status">
          <span
            className={`status-dot ${online && connection === "Live conversation" ? "live" : ""}`}
          />
          {online ? connection : "Offline · reconnect when online"}
        </small>
      </div>
      {room?.slug === "todays-scripture" && (
        <aside className="scripture-pinned">
          <p className="screen-meta">Today’s conversation · system card</p>
          <blockquote>{verse.quote}</blockquote>
          <small>{verse.reference} · WEB</small>
          <p>{verse.question}</p>
        </aside>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => (roomId ? setRetry((n) => n + 1) : void getRooms())}
          >
            Retry conversation
          </button>
        </div>
      )}
      <div
        className="message-feed"
        ref={feed}
        aria-label="Messages"
        onScroll={() => {
          if (feed.current)
            nearBottom.current =
              feed.current.scrollHeight -
                feed.current.scrollTop -
                feed.current.clientHeight <
              70;
        }}
      >
        {hasEarlier && (
          <button
            className="secondary"
            disabled={earlierBusy}
            onClick={() => void earlier()}
          >
            {earlierBusy ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {loading && <p role="status">Loading conversation…</p>}
        {!loading && !shown.length && (
          <p className="empty">
            A quiet space for now.{" "}
            {supabase
              ? "Be the first to share a little encouragement."
              : "Live messages will appear here after setup."}
          </p>
        )}
        {shown.map((m) => (
          <article className="message" key={m.id}>
            <div className="avatar" aria-hidden="true">
              {initials(m.display_name)}
            </div>
            <div className="message-content">
              <strong>{m.display_name}</strong>
              <p>{m.body}</p>
              <div className="message-meta">
                <time dateTime={m.created_at}>
                  {supabase ? timestamp(m.created_at) : "Example conversation"}
                </time>
                {supabase && (
                  <SafetyControls
                    id={m.id}
                    kind="chat"
                    onChange={() =>
                      window.dispatchEvent(new Event("hfg-blocks-changed"))
                    }
                  />
                )}
                {userId && m.user_id === userId && (
                  <button
                    className="text-button"
                    aria-label="Delete your message"
                    disabled={busy}
                    onClick={() => void remove(m)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <form className="composer" onSubmit={send}>
        <label htmlFor="chat-body">Share encouragement</label>
        <textarea
          id="chat-body"
          maxLength={500}
          rows={3}
          disabled={!canWrite || busy}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            canWrite
              ? "A kind word for the journey…"
              : supabase
                ? "Sign in and choose a name to share."
                : "Read-only preview — live chat opens after setup."
          }
        />
        <div className="row">
          <small>{body.length}/500 · plain text</small>
          <button disabled={!canWrite || busy || cooldown || !body.trim()}>
            <Send size={16} />
            {busy ? "Sending…" : cooldown ? "Please wait…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  return [
    ...new Map([...existing, ...incoming].map((m) => [m.id, m])).values(),
  ].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

function PrayerWall({
  userId,
  canWrite,
  online,
}: {
  userId?: string;
  canWrite: boolean;
  online: boolean;
}) {
  const [posts, setPosts] = useState<Prayer[]>(supabase ? [] : demoPrayers);
  const [sort, setSort] = useState<"recent" | "prayed">("recent");
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"prayer" | "testimony">("prayer");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const last = useRef("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sortRef = useRef(sort);
  sortRef.current = sort;
  useEffect(() => {
    const changed = () => {
      void fetchPosts();
    };
    window.addEventListener("hfg-blocks-changed", changed);
    return () => window.removeEventListener("hfg-blocks-changed", changed);
  }, []);
  const fetchPosts = useCallback(async () => {
    if (!supabase) return;
    const selected = sortRef.current;
    const { data, error: e } = await supabase.rpc("read_prayer_wall", {
      sort_by: selected,
    });
    if (!mounted.current || sortRef.current !== selected) return;
    if (e) setError("We could not load the Prayer Wall. Please try again.");
    else {
      setPosts((data as Prayer[]) ?? []);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!supabase)
      return () => {
        mounted.current = false;
      };
    const client = supabase;
    setLoading(true);
    void fetchPosts();
    const channel = client
      .channel("prayer-wall")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prayer_posts" },
        () => {
          void fetchPosts();
        },
      )
      .subscribe((status) => {
        if (
          mounted.current &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        )
          setError(
            "Live updates are reconnecting. The wall refreshes periodically.",
          );
      });
    const interval = setInterval(() => {
      void fetchPosts();
    }, 20000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      clearTimeout(timer.current);
      void client.removeChannel(channel);
    };
  }, [fetchPosts]);
  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts, sort, userId]);
  const post = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !canWrite || !userId || lock.current || cooldown) return;
    const text = body.trim();
    const invalid = validateCommunityText(text);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (last.current === text) {
      setError("You have already shared that post.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase.from("prayer_posts").insert({
        user_id: userId,
        body: text,
        post_type: kind,
        is_anonymous: anonymous,
      });
      if (err) throw err;
      last.current = text;
      setBody("");
      setCooldown(true);
      timer.current = setTimeout(() => setCooldown(false), 3000);
      track("prayer_posted");
      await fetchPosts();
    } catch (e) {
      setError(postError(e, "Your post was not shared. Wait a few seconds and try again."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const react = async (p: Prayer) => {
    if (!supabase || !canWrite || !userId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { error: err } = p.has_prayed
        ? await supabase
            .from("prayer_reactions")
            .delete()
            .eq("post_id", p.id)
            .eq("user_id", userId)
        : await supabase
            .from("prayer_reactions")
            .insert({ post_id: p.id, user_id: userId });
      if (err) throw err;
      track("prayer_reacted");
      await fetchPosts();
    } catch {
      setError("We could not update your prayer reaction. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = async (p: Prayer) => {
    if (!supabase || p.user_id !== userId || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const { error: e, data } = await supabase
        .from("prayer_posts")
        .delete()
        .eq("id", p.id)
        .select("id");
      if (e || !data?.length) throw e;
      await fetchPosts();
    } catch {
      setError("We could not delete your post. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="helper">
        Pray with care. Keep personal details private. Community prayer does not
        replace emergency or professional support.
      </p>
      <div className="row">
        <h2>Prayer Wall</h2>
        <label className="sr-only" htmlFor="prayer-sort">
          Sort posts
        </label>
        <select
          id="prayer-sort"
          className="compact-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as "recent" | "prayed")}
        >
          <option value="recent">Recent</option>
          <option value="prayed">Most prayed</option>
        </select>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              void fetchPosts();
            }}
          >
            Refresh wall
          </button>
        </div>
      )}
      {!online && <p role="status">Offline · reconnect to read new posts.</p>}
      {loading && <p role="status">Loading prayers…</p>}
      {!loading && !posts.length && (
        <p className="empty">
          There are no posts yet. A simple prayer is welcome here.
        </p>
      )}
      {posts.map((p) => (
        <article className="card prayer-card" key={p.id}>
          <div className="row">
            <span className="post-kind">
              {p.post_type === "prayer" ? "Prayer request" : "Testimony"}
            </span>
            <small>{supabase ? timestamp(p.created_at) : "Example post"}</small>
          </div>
          <p className="user-body">{p.body}</p>
          <small>Shared by {p.display_name}</small>
          <div className="row prayer-actions">
            <button
              className="secondary"
              disabled={!canWrite || busy}
              aria-pressed={p.has_prayed}
              onClick={() => void react(p)}
            >
              <Heart size={16} />
              {p.has_prayed ? "You prayed" : "I prayed"} · {p.prayed_count}
            </button>
            {supabase && (
              <SafetyControls
                id={p.id}
                kind="prayer"
                onChange={() =>
                  window.dispatchEvent(new Event("hfg-blocks-changed"))
                }
              />
            )}
            {userId && p.user_id === userId && (
              <button
                className="icon-button"
                disabled={busy}
                aria-label="Delete your post"
                onClick={() => void remove(p)}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        </article>
      ))}
      <form className="card composer" onSubmit={post}>
        <h3>Share a prayer or testimony</h3>
        <label htmlFor="post-kind">Post type</label>
        <select
          id="post-kind"
          value={kind}
          disabled={!canWrite || busy}
          onChange={(e) => setKind(e.target.value as "prayer" | "testimony")}
        >
          <option value="prayer">Prayer Request</option>
          <option value="testimony">Testimony</option>
        </select>
        <label htmlFor="prayer-body">Your words</label>
        <textarea
          id="prayer-body"
          rows={4}
          maxLength={500}
          value={body}
          disabled={!canWrite || busy}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            canWrite
              ? "Share with kindness and care…"
              : "Sign in to share. This space is open to read."
          }
        />
        <label className="check-label">
          <input
            type="checkbox"
            disabled={!canWrite || busy}
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          Show as anonymous
        </label>
        <small>
          Your name is hidden from readers; project administrators can still
          identify authors.
        </small>
        <div className="row">
          <small>{body.length}/500</small>
          <button disabled={!canWrite || busy || cooldown || !body.trim()}>
            {busy ? "Sharing…" : cooldown ? "Please wait…" : "Share"}
          </button>
        </div>
      </form>
    </div>
  );
}
