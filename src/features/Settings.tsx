import { TopicPreferences } from "../topics/Preferences";
import { useEffect, useState } from "react";
import { usePlatform } from "../platform/store";
import { backupData } from "../platform/persistence";
import { goals, type Theme } from "../platform/models";
import { AuthPanel, DeleteAccount, useAuth } from "../platform/auth";
import { supabase } from "../supabase";
import { config } from "../config";
// The trust pages, reachable from inside the app: store reviewers look for them here (GATE-02). The site
// links open in a new tab so the reader keeps their place; support is shown only once forwarding is
// proven (config.supportEmailReady), so the app never points at an address nobody reads.
export function LegalLinks() {
  const pages = [
    ["Privacy policy", "/privacy"],
    ["Terms of use", "/terms"],
    ["How account deletion works", "/delete-account"],
  ] as const;
  return (
    <nav className="legal-links" aria-label="Privacy and help">
      <ul>
        {pages.map(([label, path]) => (
          <li key={path}>
            <a href={`${config.siteUrl}${path}`} target="_blank" rel="noopener">
              {label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
        {config.supportEmailReady && (
          <li>
            <a href={`mailto:${config.supportEmail}`}>Contact support</a>
          </li>
        )}
      </ul>
    </nav>
  );
}
export function Settings() {
  const { state, update, notice, recover, storage } = usePlatform();
  const [status, setStatus] = useState("");
  const [backup, setBackup] = useState(false);
  // "Privacy and your data" on You opens /settings#privacy: bring that section into view.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  function exportBackup() {
    try {
      const blob = new Blob([backupData(storage)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hisfullglory-private-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackup(true);
      setStatus("Private backup exported. Store it securely.");
    } catch {
      setStatus("Backup unavailable: browser storage cannot be read.");
    }
  }
  return (
    <section>
      <h1>Your rhythm, your settings.</h1>
      <div className="card">
        <h2>Appearance</h2>
        <label>
          Theme
          <select
            aria-label="Theme"
            value={state.theme}
            onChange={(e) =>
              update((s) => ({ ...s, theme: e.target.value as Theme }))
            }
          >
            {["system", "light", "dark"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <p>
          System follows your device, including changes while this app is open.
        </p>
      </div>
      <div className="card">
        <h2>Your daily rhythm</h2>
        <label>
          Minutes
          <select
            value={state.preferences.minutes}
            onChange={(e) =>
              update((s) => ({
                ...s,
                preferences: {
                  ...s.preferences,
                  minutes: Number(e.target.value) as 5 | 10 | 20,
                },
              }))
            }
          >
            {[5, 10, 20].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Time
          <select
            value={state.preferences.time}
            onChange={(e) =>
              update((s) => ({
                ...s,
                preferences: {
                  ...s.preferences,
                  time: e.target.value as typeof s.preferences.time,
                },
              }))
            }
          >
            {["morning", "afternoon", "evening"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Faith journey
          <select
            value={state.preferences.journey}
            onChange={(e) =>
              update((s) => ({
                ...s,
                preferences: { ...s.preferences, journey: e.target.value },
              }))
            }
          >
            {[
              "New to faith",
              "Returning to faith",
              "Growing in faith",
              "Exploring faith",
              "Prefer not to say",
            ].map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </label>
        <p>Focus · choose up to three</p>
        <div className="chips">
          {goals.map((g) => (
            <button
              className="secondary"
              key={g}
              aria-pressed={state.preferences.goals.includes(g)}
              disabled={
                state.preferences.goals.length === 3 &&
                !state.preferences.goals.includes(g)
              }
              onClick={() =>
                update((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    goals: s.preferences.goals.includes(g)
                      ? s.preferences.goals.filter((x) => x !== g)
                      : [...s.preferences.goals, g],
                  },
                }))
              }
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="card" id="privacy">
        <h2>Privacy and recovery</h2>
        <p>
          Private journal, prayers, bookmarks and journey progress remain in
          browser storage. Export before clearing data or switching devices.
          Public posts are shared only after you publish explicitly.
          Each signed-in account has a separate local profile. Guest data stays in
          the guest profile and is never automatically adopted. Browser storage
          is unencrypted; account separation is not protection from someone with
          access to this browser's developer tools.
        </p>
        <button onClick={exportBackup}>Export private backup</button>
        {notice && (
          <>
            <p>{notice}</p>
            <button
              className="secondary"
              disabled={!backup}
              onClick={() => {
                if (
                  window.confirm(
                    "Preserve current v3 under a recovery key, then recover available v2/v1 data in this profile? If no readable legacy data exists, this starts fresh.",
                  )
                )
                  recover();
              }}
            >
              Recover legacy / start fresh…
            </button>
          </>
        )}
        <p role="status">{status}</p>
        <small>
          No encrypted cloud sync or cross-device restore is configured. To
          delete your account and its server data, use "Delete my account" on
          your Profile page; use own-content deletion controls for public
          contributions.
        </small>
      </div>
      <TopicPreferences selected={state.privateTopics} onChange={privateTopics => update(s => ({...s,privateTopics}))} />
      <BlockedAuthors />
      <div className="card">
        <h2>About and legal</h2>
        <LegalLinks />
      </div>
    </section>
  );
}
export function BlockedAuthors() {
  const { session } = useAuth();
  const [blocks, setBlocks] = useState<
    { id: string; action: string; created_at: string }[]
  >([]);
  // loading: show the heading only; ready: rows or the empty text; error: the status line only.
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState("");
  async function load(isCurrent: () => boolean = () => true) {
    if (!supabase || !session) return;
    let rows: { id: string; action: string; created_at: string }[] | null = null;
    try {
      const { data, error } = await supabase.rpc("read_own_blocks");
      if (!error) rows = data ?? [];
    } catch {
      rows = null;
    }
    if (!isCurrent()) return;
    if (rows) {
      setBlocks(rows);
      setStatus("");
      setPhase("ready");
    } else {
      setBlocks([]);
      setStatus("Block list unavailable.");
      setPhase("error");
    }
  }
  useEffect(() => {
    let current = true;
    setPhase("loading");
    setStatus("");
    void load(() => current);
    return () => {
      current = false;
    };
  }, [session?.user.id]);
  if (!session) return null;
  return (
    <div className="card">
      <h2>Blocked authors</h2>
      <p>These private entries do not reveal anonymous profile names.</p>
      {blocks.map((b, i) => (
        <p key={b.id}>
          Author {i + 1} · {b.action} ·{" "}
          {new Date(b.created_at).toLocaleDateString()}{" "}
          <button
            className="secondary"
            aria-label={`Remove ${b.action} for Author ${i + 1}`}
            onClick={async () => {
              const { error } = await supabase!.rpc("remove_block", {
                blocked_user: b.id,
              });
              if (error) setStatus("Could not remove block.");
              else await load();
            }}
          >
            Remove
          </button>
        </p>
      ))}
      {phase === "ready" && !blocks.length && <p>No blocked authors.</p>}
      <div role="status">{status && <p>{status}</p>}</div>
    </div>
  );
}
export function Profile() {
  const { state } = usePlatform();
  return (
    <section>
      <h1>Your walk with God.</h1>
      <div className="card">
        <p>
          {state.local.completedDates.length} daily walks completed ·{" "}
          {state.reading.length} chapters read
        </p>
        <p>
          {state.entries.length} private journal entries ·{" "}
          {state.prayers.length} private prayers
        </p>
        <small>
          Your reading and private reflections are not attached to a public
          profile.
        </small>
      </div>
      <AuthPanel />
      <div className="card">
        <h2>Account and privacy</h2>
        <p>
          You sign in with a 6-digit code we email you. Signing in does not
          upload your private journal or prayers.
        </p>
        <p>
          Use Settings to export your private data. You can delete your account
          on this page at any time.
        </p>
        <LegalLinks />
      </div>
      <DeleteAccount />
    </section>
  );
}
