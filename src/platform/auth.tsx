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
import { deletedWithAccount, isDeleteConfirmation } from "./deleteConfirm";
import { navigate } from "./router";
import { config } from "../config";
import { CodeEntry, SignInNote, SiteLink, codeSendFailed, codeSentStatus } from "./CodeEntry";
import { GoogleButton } from "./GoogleButton";
// Marker text until the founder confirms the age; the production build refuses to ship it
// (vite.config.ts), so the app never shows a placeholder to the public.
import { ageLabel } from "../../site/src/data/legal.ts";
import { postError } from "../social/blockedLanguage";
import {
  codeFailureMessage,
  googleFailed,
  hasOauthError,
  oauthRedirectTo,
  withoutOauthError,
} from "./googleSignIn";
export const TERMS_VERSION = "2026-10-19";
const Auth = createContext<{
  session: Session | null;
  ready: boolean;
  accepted: boolean;
  /** Words for a Google sign-in that came back with an error, until the next try. Empty otherwise. */
  oauthError: string;
  clearOauthError: () => void;
  refresh: () => Promise<void>;
}>({
  session: null,
  ready: false,
  accepted: false,
  oauthError: "",
  clearOauthError: () => {},
  refresh: async () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const generation = useRef(0);
  const [authEpoch,setAuthEpoch] = useState(0);
  // Supabase sends the reader back with error parameters on the address when Google sign-in fails
  // (in the hash for the implicit flow this app uses, in the query otherwise). Read once, kept here.
  const [oauthError, setOauthError] = useState(() =>
    typeof window !== "undefined" && hasOauthError(window.location) ? googleFailed : "",
  );
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
  // The error parameters leave the address bar, so a reload does not show the message again.
  useEffect(() => {
    const here = window.location.pathname + window.location.search + window.location.hash;
    const clean = withoutOauthError(here);
    if (clean !== here) window.history.replaceState(window.history.state, "", clean);
  }, []);
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
    <Auth.Provider
      value={{ session, ready, accepted, oauthError, clearOauthError: () => setOauthError(""), refresh }}
    >
      {children}
    </Auth.Provider>
  );
}
export const useAuth = () => useContext(Auth);
export function AuthPanel() {
  const { session, accepted, oauthError, clearOauthError, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(false);
  // An error is announced as an alert that starts with "Error:", everything else as a status.
  const [status, setStatusLine] = useState({ text: "", error: false });
  const setStatus = (text: string, error = false) => setStatusLine({ text, error });
  const [busy, setBusy] = useState(false);
  // True from the press on "Continue with Google" until the browser has left for Google.
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [sentAt, setSentAt] = useState(0);
  // Coming back with the Back button can restore this page as it was left, still waiting for Google.
  useEffect(() => {
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) setGoogleBusy(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  useEffect(() => {
    if (session && supabase)
      void supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .maybeSingle()
        .then((r) => setName(r.data?.display_name ?? ""));
  }, [session?.user.id]);
  // Asks for an email with the sign-in code. Resolves "" when it was sent, otherwise the words for the failure.
  async function requestCode(address: string) {
    if (!supabase) return codeSendFailed;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: window.location.origin },
      });
      return error ? codeFailureMessage(error) : "";
    } catch {
      return codeSendFailed;
    }
  }
  async function login() {
    const address = email.trim();
    if (!supabase || busy || googleBusy || !address) return;
    setBusy(true);
    setStatus("");
    clearOauthError();
    const failure = await requestCode(address);
    if (!failure) {
      setSentTo(address);
      setSentAt(Date.now());
      setStatus(codeSentStatus);
    } else setStatus(failure, true);
    setBusy(false);
  }
  // Asking again resets the wait that CodeEntry counts down.
  async function resendCode() {
    const sent = !(await requestCode(sentTo));
    if (sent) setSentAt(Date.now());
    return sent;
  }
  // Sends the browser to Google by way of Supabase, and back to this page. On success the page is
  // left, so the busy state stays until then. Only the provider and the way back are passed on.
  async function continueWithGoogle() {
    if (!supabase || busy || googleBusy) return;
    setGoogleBusy(true);
    setStatus("");
    clearOauthError();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: oauthRedirectTo(window.location) },
      });
      if (error) throw error;
    } catch {
      setStatus(googleFailed, true);
      setGoogleBusy(false);
    }
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
      setStatus("Profile could not be loaded. Try again.", true);
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
      setStatus(postError(error, "Name could not be saved. Use 2–40 characters."), true);
      setBusy(false);
      return;
    }
    if (checked) {
      const result = await supabase.rpc("accept_community_terms", {
        terms_version: TERMS_VERSION,
      });
      if (result.error) {
        setStatus("We could not save that. Check your connection and try again.", true);
        setBusy(false);
        return;
      }
      await refresh();
    }
    setStatus("Profile saved.");
    setBusy(false);
  }
  // A Google sign-in that came back with an error is told until the next try, if nothing newer was said.
  const line = status.text || session || !oauthError ? status : { text: oauthError, error: true };
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
        {session ? "Your community profile" : "Sign in when you are ready"}
      </h2>
      {!session ? (
        <>
          <GoogleButton
            busy={googleBusy}
            disabled={busy}
            onPress={() => void continueWithGoogle()}
          />
          <p className="sign-in-or">or</p>
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
            <button className="secondary" disabled={busy || googleBusy}>
              {busy ? "Sending…" : "Email me a sign-in code"}
            </button>
            <SignInNote />
          </form>
        </>
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
            <label className="check terms-accept">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                {ageLabel}. I accept the{" "}
                <SiteLink path="/terms">Terms of use</SiteLink> and the community rules, and I have read the{" "}
                <SiteLink path="/privacy">Privacy policy</SiteLink>.{" "}
                I understand that reports are reviewed by a person.{" "}
                <span className="terms-version">Version {TERMS_VERSION}.</span>
              </span>
            </label>
          )}
          <button
            onClick={() => void save()}
            disabled={busy || name.trim().length < 2}
          >
            {busy ? "Saving…" : `Save profile${checked ? " and accept rules" : ""}`}
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
      <p role="status">{line.error ? "" : line.text}</p>
      {line.error && (
        <p role="alert" className="danger-text">
          <span className="sr-only">Error: </span>
          {line.text}
        </p>
      )}
      {!session && sentTo && (
        <CodeEntry email={sentTo} sentAt={sentAt} onResend={resendCode} />
      )}
    </section>
  );
}

// Signing out remounts the private profile, so the confirmation survives in session storage. If
// storage is blocked, the page remembers it for as long as it stays open.
const deletedNotice = "hfg-account-deleted";
let deletedOnThisPage = false;
function takeDeletedNotice() {
  const here = deletedOnThisPage;
  deletedOnThisPage = false;
  try {
    const seen = sessionStorage.getItem(deletedNotice) === "1";
    sessionStorage.removeItem(deletedNotice);
    return seen || here;
  } catch {
    return here;
  }
}

/**
 * Deletes the signed-in account and everything the server holds for it (migration 007), then
 * what this device kept for it. The App Store and Google Play both require this in the app.
 * Layout, copy and states: UI-SPEC Surface 5.
 */
export function DeleteAccount() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleted, setDeleted] = useState(takeDeletedNotice);
  // A second press can arrive before React shows the busy state, so the call itself is guarded.
  const calling = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const showDone = deleted && !session;
  // Focus follows the person: into the field when the confirmation opens, onto the confirmation
  // when the card that held it is replaced (otherwise it falls to <body>).
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  useEffect(() => {
    if (showDone) doneHeading.current?.focus();
  }, [showDone]);
  if (showDone)
    return (
      <section className="card" role="status" tabIndex={-1}>
        <h2 ref={doneHeading} tabIndex={-1}>
          Your account has been deleted
        </h2>
        <p>
          Everything the server held for it has been removed, and this device
          no longer keeps its private data. You can keep reading and walking as
          a guest.
        </p>
        <a
          className="button secondary"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          Go to Today
        </a>
      </section>
    );
  if (!supabase || !session) return null;
  const matches = isDeleteConfirmation(typed);
  const wrong = typed.trim() !== "" && !matches;
  function keepAccount() {
    setOpen(false);
    setTyped("");
    setFailed(false);
    trigger.current?.focus();
  }
  async function remove() {
    if (!supabase || !session || calling.current || !matches) return;
    calling.current = true;
    setBusy(true);
    setFailed(false);
    const userId = session.user.id;
    let error: unknown = null;
    try {
      ({ error } = await supabase.rpc("delete_my_account"));
    } catch (thrown) {
      error = thrown;
    }
    if (error) {
      setFailed(true);
      setBusy(false);
      calling.current = false;
      return;
    }
    deletedOnThisPage = true;
    try {
      forgetAccount(localStorage, userId);
      sessionStorage.setItem(deletedNotice, "1");
    } catch {
      /* Storage may be blocked. The server data is gone either way. */
    }
    setDeleted(true);
    // The account no longer exists, so only this device's session is left to end.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* The token stops working by itself; there is nothing to undo. */
    }
  }
  return (
    <section className="card delete-account" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">Delete your account</h2>
      <p>
        This permanently deletes your account and everything the server holds
        for it. It cannot be undone.
      </p>
      <ul>
        {deletedWithAccount.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        The private journal, prayers and reading saved for this account on this
        device are removed too. Export a private backup in Settings first if
        you want to keep them.
      </p>
      <button
        type="button"
        ref={trigger}
        className="secondary danger"
        aria-expanded={open}
        aria-controls="delete-account-confirmation"
        onClick={() => {
          if (busy) return;
          if (open) keepAccount();
          else setOpen(true);
        }}
      >
        Delete my account
      </button>
      <div id="delete-account-confirmation" hidden={!open}>
        {open && (
          <form
            aria-busy={busy}
            onSubmit={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            <h3>Confirm deletion</h3>
            <p>
              This cannot be undone. Your account and everything the server
              holds for it is deleted now.
            </p>
            <label>
              Type DELETE to confirm
              <input
                ref={field}
                id="delete-account-confirm"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                value={typed}
                aria-describedby={wrong ? "delete-account-hint" : undefined}
                onChange={(e) => setTyped(e.target.value)}
              />
            </label>
            {wrong && (
              <p id="delete-account-hint" className="delete-hint">
                Type DELETE exactly to confirm.
              </p>
            )}
            <button
              className="danger"
              disabled={!matches}
              aria-disabled={busy || undefined}
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={keepAccount}
            >
              Keep my account
            </button>
            <p role="status">{busy ? "Deleting your account." : ""}</p>
            {failed && (
              <p role="alert" className="danger-text">
                <span className="sr-only">Error: </span>
                Your account was not deleted, and nothing was removed.{" "}
                {config.supportEmailReady ? (
                  <>
                    Try again. If it keeps failing, email{" "}
                    <a href={`mailto:${config.supportEmail}`}>
                      {config.supportEmail}
                    </a>
                    .
                  </>
                ) : (
                  "Try again later."
                )}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
