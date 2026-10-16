// Sign in with the code from the email. A link in the email opens the browser, not an app installed
// from a store, so the code is what works everywhere; the email shows it first (Supabase Auth,
// Magic Link template, with {{ .Token }}). The words here match that email (UI-SPEC Surface 6b).
// The code is a credential: it lives in the field and is sent to Supabase, and nowhere else. It is
// never put in an address, in storage or in a log.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../supabase";
import { config } from "../config";
import { cleanCode, resendSecondsLeft } from "./signInCode";

/** A link to a page of the website. It opens in a new tab so the reader keeps their place. */
export function SiteLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a
      className="inline-link"
      href={`${config.siteUrl}${path}`}
      target="_blank"
      rel="noopener"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The sentence under the send button: what arrives, and what continuing means. */
export function SignInNote() {
  return (
    <p className="sign-in-note">
      We will email you a 6-digit code. No password. By continuing you agree to
      the <SiteLink path="/terms">Terms of use</SiteLink> and the{" "}
      <SiteLink path="/privacy">Privacy policy</SiteLink>.
    </p>
  );
}

/** The words after an email was requested. */
export const codeSentStatus =
  "Check your email. The code usually arrives within a minute. Look in spam if you do not see it.";
export const codeSendFailed =
  "We could not send the code. Check the address, wait a minute and try again.";

export function CodeEntry({
  email,
  sentAt,
  onResend,
}: {
  email: string;
  /** When the email was requested (Date.now()). The wait before asking again runs from here. */
  sentAt: number;
  /** Asks for a new email to the same address. Resolves true when it was sent. */
  onResend: () => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const [now, setNow] = useState(() => Date.now());
  // Counts the wait down once a second, and stops when it is over.
  useEffect(() => {
    setNow(Date.now());
    if (resendSecondsLeft(sentAt, Date.now()) === 0) return;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (resendSecondsLeft(sentAt, at) === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [sentAt]);
  if (!supabase) return null;
  const token = cleanCode(code);
  const wait = resendSecondsLeft(sentAt, now);
  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy || !token) return;
    setBusy(true);
    setNote({ text: "", error: false });
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    setNote(
      error
        ? { text: "That code did not work. Check the 6 digits, or ask for a new email.", error: true }
        : { text: "Signed in.", error: false },
    );
  }
  async function resend() {
    if (resending || wait > 0) return;
    setResending(true);
    setNote({ text: "", error: false });
    const sent = await onResend();
    setNote(
      sent
        ? { text: "A new code is on its way. Check your email.", error: false }
        : { text: "We could not send a new code. Wait a minute and try again.", error: true },
    );
    setResending(false);
  }
  return (
    <form className="code-entry" onSubmit={(e) => void verify(e)}>
      <p className="code-sent">We sent a code to {email}.</p>
      <label>
        Enter the 6-digit code from your email
        <input
          id="sign-in-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={14}
          aria-describedby="sign-in-code-hint"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <p id="sign-in-code-hint" className="sign-in-note">
        Never share this code. We will never ask you for it.
      </p>
      <button disabled={busy || !token}>{busy ? "Signing in…" : "Sign in with code"}</button>
      <button
        type="button"
        className="secondary"
        disabled={resending || wait > 0}
        aria-describedby={wait > 0 ? "sign-in-wait" : undefined}
        onClick={() => void resend()}
      >
        {resending ? "Sending…" : "Send a new code"}
      </button>
      {wait > 0 && (
        <p id="sign-in-wait" className="sign-in-note">
          You can ask again in {wait} {wait === 1 ? "second" : "seconds"}.
        </p>
      )}
      <p role="status">{note.error ? "" : note.text}</p>
      {note.error && (
        <p role="alert" className="danger-text">
          <span className="sr-only">Error: </span>
          {note.text}
        </p>
      )}
    </form>
  );
}
