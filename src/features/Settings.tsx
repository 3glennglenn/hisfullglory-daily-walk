import { TopicPreferences } from "../topics/Preferences";
import { useEffect, useState } from "react";
import { usePlatform } from "../platform/store";
import { backupData } from "../platform/persistence";
import { goals } from "../platform/models";
import { AuthPanel, DeleteAccount, useAuth } from "../platform/auth";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle, Toolbar } from "../ui/Screen";
import { ConfirmDialog } from "../ui/ConfirmDialog";
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
// A native select as a row: the title on the left, the control on the right (UI-SPEC A12).
function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: readonly (string | number)[];
  onChange: (value: string) => void;
}) {
  return (
    <li>
      <label className="list-row select-row">
        <span className="list-row-title">{label}</span>
        <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
    </li>
  );
}
export function Settings() {
  const { state, update, notice, recover, storage } = usePlatform();
  const [status, setStatus] = useState("");
  const [backup, setBackup] = useState(false);
  const [confirmRecover, setConfirmRecover] = useState(false);
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
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>Settings</LargeTitle>
      <GroupedList title="Daily rhythm">
        <SelectRow
          label="Minutes"
          value={state.preferences.minutes}
          options={[5, 10, 20]}
          onChange={(v) =>
            update((s) => ({
              ...s,
              preferences: { ...s.preferences, minutes: Number(v) as 5 | 10 | 20 },
            }))
          }
        />
        <SelectRow
          label="Time"
          value={state.preferences.time}
          options={["morning", "afternoon", "evening"]}
          onChange={(v) =>
            update((s) => ({
              ...s,
              preferences: { ...s.preferences, time: v as typeof s.preferences.time },
            }))
          }
        />
        <SelectRow
          label="Faith journey"
          value={state.preferences.journey}
          options={[
            "New to faith",
            "Returning to faith",
            "Growing in faith",
            "Exploring faith",
            "Prefer not to say",
          ]}
          onChange={(v) =>
            update((s) => ({
              ...s,
              preferences: { ...s.preferences, journey: v },
            }))
          }
        />
        <li className="list-row-block">
          <p className="list-row-title">Focus · choose up to three</p>
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
        </li>
      </GroupedList>
      <TopicPreferences selected={state.privateTopics} onChange={privateTopics => update(s => ({...s,privateTopics}))} />
      <GroupedList title="Privacy and your data" id="privacy" note={<span role="status">{status}</span>}>
        <Row title="Export private backup" onClick={exportBackup} />
        {notice && (
          <li className="list-row-block">
            <p>{notice}</p>
            <button
              className="secondary"
              disabled={!backup}
              onClick={() => setConfirmRecover(true)}
            >
              Recover older data
            </button>
          </li>
        )}
        <Row
          quiet
          external
          href={`${config.siteUrl}/privacy`}
          title="Your journal, prayers and reading progress stay on this device."
        />
      </GroupedList>
      <BlockedAuthors />
      <GroupedList title="About and legal" plain>
        <LegalLinks />
      </GroupedList>
      {confirmRecover && (
        <ConfirmDialog
          title="Recover older data?"
          body="We keep a copy of your current data, then bring back anything an older version of the app saved on this device. If there is nothing older, you start fresh."
          actionLabel="Recover older data"
          safeLabel="Keep things as they are"
          onAction={() => {
            setConfirmRecover(false);
            recover();
          }}
          onSafe={() => setConfirmRecover(false)}
        />
      )}
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
// Account (UI-SPEC A12): the sign-in form and code entry, or the account details, then the legal links,
// then "Sign out" (AuthPanel's own button, shown as a plain link row by the stylesheet), then deletion.
// The words of AuthPanel, CodeEntry, the terms acceptance, LegalLinks and DeleteAccount are PR #27's, unchanged.
export function Profile() {
  return (
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>Account</LargeTitle>
      <AuthPanel />
      <GroupedList title="Account and privacy" plain>
        <div className="group-pad">
          <p>
            You sign in with Google or with a 6-digit code we email you. Signing
            in does not upload your private journal or prayers.
          </p>
          <p>
            Use Settings to export your private data. You can delete your account
            on this page at any time.
          </p>
        </div>
        <LegalLinks />
      </GroupedList>
      <DeleteAccount />
    </section>
  );
}
