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
import { CodeEntry } from "./CodeEntry";
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
        : "Check your email: tap the link, or type the code below.",
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
      setStatus("Name could not be saved. Use 2–40 characters.");
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
