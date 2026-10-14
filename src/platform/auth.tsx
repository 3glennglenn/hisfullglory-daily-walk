import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { forgetAccount } from "./persistence";
import { CodeEntry } from "./CodeEntry";
import { postError } from "../social/blockedLanguage";
export const TERMS_VERSION = "2026-10-07";
const Auth = createContext<{
  session: Session | null;
  ready: boolean;
  accepted: boolean;
  refresh: () => Promise<void>;
}>({ session: null, ready: false, accepted: false, refresh: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const generation = useRef(0);
  const [authEpoch,setAuthEpoch] = useState(0);
  async function refresh() {
    if (!supabase) return;
    const request = generation.current;
    const { data } = await supabase
      .from("community_terms")
      .select("version")
      .eq("version", TERMS_VERSION)
      .maybeSingle();
    if (request === generation.current) setAccepted(data?.version === TERMS_VERSION);
  }
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const initialGeneration = generation.current;
    void supabase.auth.getSession().then((r) => {
      if (!active || r.error || generation.current !== initialGeneration) return;
      setSession(r.data.session); setReady(true);
    }).catch(() => { /* Remain locked rather than exposing a guest profile. */ });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      generation.current++;setAuthEpoch(generation.current);
      setSession(s); setAccepted(false); setReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    setAccepted(false);
    if (session) void refresh();
  }, [session?.user.id,authEpoch]);
  return (
    <Auth.Provider value={{ session, ready, accepted, refresh }}>
      {children}
    </Auth.Provider>
  );
}
export const useAuth = () => useContext(Auth);
export function AuthPanel() {
  const { session, accepted, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  useEffect(() => {
    if (session && supabase)
      void supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .maybeSingle()
        .then((r) => setName(r.data?.display_name ?? ""));
  }, [session?.user.id]);
  async function login() {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(
      error
        ? "Sign-in could not be sent. Check configuration and try again."
        : "Check your email for a sign-in link.",
    );
    if (!error) setSentTo(email.trim());
    setBusy(false);
  }
  async function save() {
    if (!supabase || !session || name.trim().length < 2 || busy) return;
    setBusy(true);
    const existing = await supabase
      .from("profiles")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (existing.error) {
      setStatus("Profile could not be loaded. Try again.");
      setBusy(false);
      return;
    }
    const { error } = existing.data
      ? await supabase
          .from("profiles")
          .update({ display_name: name.trim() })
          .eq("id", session.user.id)
      : await supabase
          .from("profiles")
          .insert({ id: session.user.id, display_name: name.trim() });
    if (error) {
      setStatus(postError(error, "Name could not be saved. Use 2–40 characters."));
      setBusy(false);
      return;
    }
    if (checked) {
      const result = await supabase.rpc("accept_community_terms", {
        terms_version: TERMS_VERSION,
      });
      if (result.error) {
        setStatus(
          "Terms could not be accepted. Apply the platform migrations.",
        );
        setBusy(false);
        return;
      }
      await refresh();
    }
    setStatus("Profile saved.");
    setBusy(false);
  }
  if (!supabase)
    return (
      <section className="card">
        <h2>Continue as a guest</h2>
        <p>
          Your private walk, Bible, journal and prayers work on this device.
          Community publishing and support requests become available after the
          operator configures Supabase.
        </p>
        <small>Google, Apple, cloud sync and push are not configured.</small>
      </section>
    );
  return (
    <section className="card">
      <h2>
        {session ? "Your community profile" : "Sign in when you’re ready"}
      </h2>
      {!session ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button disabled={busy}>Send secure sign-in link</button>
        </form>
      ) : (
        <>
          <label>
            Display name
            <input
              maxLength={40}
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {!accepted && (
            <label className="check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              I accept the community rules, version {TERMS_VERSION}: no
              harassment, threats, hate, sexual content, scams, spam,
              impersonation, illegal activity, dangerous advice or private
              information. I understand reports are reviewed manually.
            </label>
          )}
          <button
            onClick={() => void save()}
            disabled={busy || name.trim().length < 2}
          >
            Save profile{checked ? " and accept rules" : ""}
          </button>
          <button
            className="secondary"
            onClick={() => void supabase?.auth.signOut()}
          >
            Sign out
          </button>
          {accepted && <small>Community rules accepted.</small>}
        </>
      )}
      <p role="status">{status}</p>
      {!session && sentTo && <CodeEntry email={sentTo} />}
    </section>
  );
}

// Signing out remounts the private profile, so the confirmation survives in session storage.
const deletedNotice = "hfg-account-deleted";
function takeDeletedNotice() {
  try {
    const seen = sessionStorage.getItem(deletedNotice) === "1";
    sessionStorage.removeItem(deletedNotice);
    return seen;
  } catch {
    return false;
  }
}

/**
 * Deletes the signed-in account and everything the server holds for it (migration 007), then
 * what this device kept for it. The App Store and Google Play both require this in the app.
 */
export function DeleteAccount() {
  const { session } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [deleted, setDeleted] = useState(takeDeletedNotice);
  if (deleted && !session)
    return (
      <section className="card" role="status">
        <h2>Your account has been deleted</h2>
        <p>
          Everything the server held for it has been removed, and this device
          no longer keeps its private data.
        </p>
      </section>
    );
  if (!supabase || !session) return null;
  async function remove() {
    if (!supabase || !session || busy || typed.trim() !== "DELETE") return;
    setBusy(true);
    const userId = session.user.id;
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setStatus(
        "Your account could not be deleted, and nothing was removed. Try again, or email support@hisfullglory.com.",
      );
      setBusy(false);
      return;
    }
    try {
      forgetAccount(localStorage, userId);
      sessionStorage.setItem(deletedNotice, "1");
    } catch {
      /* Storage may be blocked. The server data is gone either way. */
    }
    setDeleted(true);
    // The account no longer exists, so only this device's session is left to end.
    await supabase.auth.signOut({ scope: "local" });
  }
  return (
    <section className="card">
      <h2>Delete your account</h2>
      <p>
        This permanently deletes your account and everything the server holds
        for it: your profile, your posts, prayers and chat messages, reactions
        and votes, reports you sent, blocks, community memberships and support
        requests. Replies other people wrote under your posts are removed with
        them. Circles you own are closed, with their posts.
      </p>
      <p>
        The private journal, prayers and reading saved for this account on this
        device are removed too. Export a private backup in Settings first if
        you want to keep them.
      </p>
      {!confirming ? (
        <button className="secondary" onClick={() => setConfirming(true)}>
          Delete my account
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <label>
            Type DELETE to confirm
            <input
              id="delete-account-confirm"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <button disabled={busy || typed.trim() !== "DELETE"}>
            {busy ? "Deleting…" : "Delete my account permanently"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              setTyped("");
            }}
          >
            Cancel
          </button>
        </form>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
