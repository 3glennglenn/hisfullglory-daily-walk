import { useEffect, useState, useRef } from "react";
import {
  causes,
  supportCategories,
  goFundMeProvider,
  hasPaymentDetails,
  supportExpiry,
  type SupportRequest,
} from "./catalog";
import { GivePager, checkedOn } from "./GivePages";
import { supabase } from "../supabase";
import { AuthPanel, useAuth } from "../platform/auth";
import { SafetyControls } from "../social/safety";
import { track } from "../analytics";
import { Dialog } from "../platform/Dialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle, Toolbar } from "../ui/Screen";
const empty = {
  title: "",
  story: "",
  category: supportCategories[0] as string,
  declared_target: 100,
  currency: "USD",
  expires_at: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  beneficiary_relationship: "Myself",
  country: "",
  is_anonymous: false,
  fundraiser_url: "",
};
export function GivingPolicy() {
  return (
    <section className="grouped-screen">
      <Toolbar back="Give" to="/give" />
      <LargeTitle>Giving with care.</LargeTitle>
      <GroupedList plain>
        <div className="group-pad">
      <p>
        HisFullGlory helps you discover causes and reviewed personal requests.
        Donations happen on an external provider’s site. We do not collect
        money, card details, custody funds, process payouts, take fees or issue
        receipts.
      </p>
      <p>
        Provider terms govern identity checks, payments, transfers, refunds,
        disputes and receipts. A reviewed request is not a guarantee of its
        claims or of an outcome. Declared targets are unverified; current
        fundraising progress is available only at the provider.
      </p>
      <p>
        Create your external fundraiser first. Use only your own fundraiser or
        one you are authorized to represent. Submit the exact public GoFundMe
        link, explain your relationship to the beneficiary, and avoid bank
        details, wallet addresses or direct payment instructions. Every request
        requires manual review before it can be listed.
      </p>
      <p>
        Do not include sensitive medical documents, home addresses, identity
        documents or financial account information. Reports are private and
        reviewed manually. Support requests are not an emergency service or
        professional advice; seek local emergency or professional help when
        needed.
      </p>
      <p>
        Tax treatment and eligibility depend on the provider, recipient and your
        jurisdiction. We do not promise deductibility. Native collection,
        recurring gifts and platform receipts are unavailable.
      </p>
      <a
        className="inline-link"
        href="https://www.gofundme.com/c/how-it-works"
        target="_blank"
        rel="noopener noreferrer"
      >
        GoFundMe’s official process
      </a>
        </div>
      </GroupedList>
    </section>
  );
}
export function Give() {
  const { session, accepted } = useAuth();
  const [view, setView] = useState("causes");
  const [outbound, setOutbound] = useState<{
    url: string;
    title: string;
    choice?: string;
  } | null>(null);
  const [publicRequests, setPublic] = useState<SupportRequest[]>([]);
  const [mine, setMine] = useState<SupportRequest[]>([]);
  const [draft, setDraft] = useState(empty);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // The request a reader asked to close or delete, until they answer in the app's own dialog.
  const [confirming, setConfirming] = useState<{ id: string; remove: boolean } | null>(null);
  const loadVersion = useRef(0);
  const currentUser = useRef(session?.user.id);
  currentUser.current = session?.user.id;
  async function load() {
    if (!supabase) return;
    const request = ++loadVersion.current;
    const owner = session?.user.id;
    const result = await supabase.rpc("read_support_requests");
    if (request !== loadVersion.current || owner !== currentUser.current)
      return;
    if (result.error)
      setStatus(
        "Support requests are unavailable until migrations are applied.",
      );
    else setPublic(result.data ?? []);
    if (session) {
      const { data } = await supabase
        .from("support_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (request === loadVersion.current && owner === currentUser.current)
        setMine(data ?? []);
    } else setMine([]);
  }
  useEffect(() => {
    setMine([]);
    setDraft(empty);
    setDraftId(null);
    void load();
    return () => {
      loadVersion.current++;
    };
  }, [session?.user.id]);
  async function save(submit = false) {
    if (!supabase || !session || busy) return;
    if (
      !goFundMeProvider.accepts(draft.fundraiser_url) ||
      hasPaymentDetails(
        [
          draft.story,
          draft.title,
          draft.beneficiary_relationship,
          draft.country,
        ].join(" "),
      )
    ) {
      setStatus(
        "Use the exact https://www.gofundme.com/f/... link and remove direct payment details.",
      );
      return;
    }
    const expiry = supportExpiry(draft.expires_at);
    if (!expiry) {
      setStatus("Choose a valid expiration date before saving.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("save_support_draft", {
      request_id: draftId,
      request_title: draft.title,
      request_story: draft.story,
      request_category: draft.category,
      target_amount: Number(draft.declared_target),
      target_currency: draft.currency,
      expiry,
      relationship: draft.beneficiary_relationship,
      request_country: draft.country,
      anonymous: draft.is_anonymous,
      external_url: draft.fundraiser_url,
    });
    if (error) {
      setStatus(
        "Draft could not be saved. Check all fields, sign-in and the posting interval.",
      );
      setBusy(false);
      return;
    }
    setDraftId(data as string);
    if (submit) {
      const { error } = await supabase.rpc("submit_support_request", {
        request_id: data,
      });
      setStatus(
        error
          ? "Saved as draft; submission failed. Accept the current community rules first."
          : "Submitted for manual review. It is not public yet.",
      );
    } else setStatus("Private draft saved.");
    setBusy(false);
    await load();
  }
  async function close(id: string, remove = false) {
    if (!supabase) return;
    const { error } = await supabase.rpc("close_support_request", {
      request_id: id,
      remove_request: remove,
    });
    setStatus(error ? "Could not update your request." : "Request updated.");
    await load();
  }
  return (
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>Give with intention.</LargeTitle>
      <p className="screen-lede">
        Explore independently evaluated, high-impact giving options or reviewed
        requests from people. All giving stays with the external provider.
      </p>
      <div className="tabs">
        {[
          ["causes", "Causes"],
          ["people", "Support someone"],
          ["request", "My requests"],
        ].map(([v, label]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </div>
      {view === "causes" ? (
        <>
          <GivePager
            onGive={(c) =>
              setOutbound({ url: c.donationUrl, title: c.title, choice: c.checkoutChoice })
            }
          />
          <p className="give-checked">
            Checked on {checkedOn(causes.map((c) => c.verifiedOn))}. Charities and evaluators change; we re-check them regularly.
          </p>
          <p className="give-checked">Impact depends on implementation and context; no individual outcome is promised.</p>
        </>
      ) : view === "people" ? (
        <>
          <p>
            Only reviewed, visible, unexpired requests appear here. Review does
            not guarantee the campaign’s claims. Check the external provider’s
            current details before giving.
          </p>
          {!supabase && (
            <div className="card">
              Community support is not configured. Causes remain available.
            </div>
          )}
          {supabase && !publicRequests.length && (
            <div className="card">
              No reviewed requests are currently available.
            </div>
          )}
          {publicRequests.map((r) => (
            <article className="card" key={r.id}>
              <small>
                {r.category} · {r.country} · {r.status}
              </small>
              <h2>{r.title}</h2>
              <p>
                {r.display_name} · {r.beneficiary_relationship}
              </p>
              <p className="preserve">{r.story}</p>
              <p>
                Declared target: {r.currency}{" "}
                {r.declared_target.toLocaleString()} · unverified
              </p>
              <small>
                Expires {new Date(r.expires_at).toLocaleDateString()}. View
                current progress at GoFundMe.
              </small>
              <button
                onClick={() =>
                  setOutbound({ url: r.fundraiser_url, title: r.title })
                }
              >
                View fundraiser at GoFundMe
              </button>
              <SafetyControls
                id={r.id}
                kind="support"
                onChange={() => void load()}
              />
            </article>
          ))}
          <button className="secondary" onClick={() => setView("request")}>
            Submit my external fundraiser
          </button>
        </>
      ) : (
        <>
          <h2>Your external support request</h2>
          <p>
            First create and verify your fundraiser with GoFundMe. Then submit
            its public link here. Staff review its legitimacy, beneficiary
            relationship, privacy and expiry before publication.
          </p>
          {!session || !accepted ? (
            <AuthPanel />
          ) : (
            <>
              <form
                className="card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(true);
                }}
              >
                <label>
                  Title
                  <input
                    required
                    minLength={5}
                    maxLength={120}
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Story · public after approval
                  <textarea
                    required
                    minLength={30}
                    maxLength={3000}
                    rows={6}
                    value={draft.story}
                    onChange={(e) =>
                      setDraft({ ...draft, story: e.target.value })
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value })
                    }
                  >
                    {supportCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <label>
                    Declared target
                    <input
                      required
                      type="number"
                      min={1}
                      max={1000000}
                      value={draft.declared_target}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          declared_target: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Currency
                    <select
                      value={draft.currency}
                      onChange={(e) =>
                        setDraft({ ...draft, currency: e.target.value })
                      }
                    >
                      {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Expires (within 90 days)
                  <input
                    required
                    type="date"
                    value={draft.expires_at}
                    onChange={(e) =>
                      setDraft({ ...draft, expires_at: e.target.value })
                    }
                  />
                </label>
                <label>
                  Your relationship to beneficiary
                  <input
                    required
                    maxLength={100}
                    value={draft.beneficiary_relationship}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        beneficiary_relationship: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Country
                  <input
                    required
                    maxLength={80}
                    value={draft.country}
                    onChange={(e) =>
                      setDraft({ ...draft, country: e.target.value })
                    }
                  />
                </label>
                <label>
                  Exact external GoFundMe URL
                  <input
                    type="url"
                    required
                    placeholder="https://www.gofundme.com/f/your-campaign"
                    value={draft.fundraiser_url}
                    onChange={(e) =>
                      setDraft({ ...draft, fundraiser_url: e.target.value })
                    }
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={draft.is_anonymous}
                    onChange={(e) =>
                      setDraft({ ...draft, is_anonymous: e.target.checked })
                    }
                  />
                  List my display name as anonymous
                </label>
                <div className="actions">
                  <button disabled={busy}>Submit for manual review</button>
                  <button
                    type="button"
                    disabled={busy}
                    className="secondary"
                    onClick={() => void save()}
                  >
                    Save private draft
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setDraft(empty);
                      setDraftId(null);
                    }}
                  >
                    New draft
                  </button>
                </div>
              </form>
              <h2>Your requests</h2>
              {mine.map((r) => (
                <article className="card" key={r.id}>
                  <h3>{r.title}</h3>
                  <p>
                    {r.status} · {new Date(r.expires_at).toLocaleDateString()}
                  </p>
                  <div className="actions">
                    {["draft", "rejected"].includes(r.status) && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setDraftId(r.id);
                          setDraft({
                            ...r,
                            expires_at: r.expires_at.slice(0, 10),
                          });
                        }}
                      >
                        Edit private draft
                      </button>
                    )}
                    <button
                      className="secondary"
                      aria-label={`Close request: ${r.title}`}
                      onClick={() => setConfirming({ id: r.id, remove: false })}
                    >
                      Close
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setConfirming({ id: r.id, remove: true })}
                    >
                      Delete my request
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}
        </>
      )}
      <GroupedList>
        <Row title="Read the giving policy" href="/giving-policy" chevron />
      </GroupedList>
      <p role="status">{status}</p>
      {confirming && (
        <ConfirmDialog
          title={confirming.remove ? "Delete this request?" : "Close this support request?"}
          actionLabel={confirming.remove ? "Delete request" : "Close request"}
          safeLabel={confirming.remove ? "Keep request" : "Keep it open"}
          destructive={confirming.remove}
          busyLabel={confirming.remove ? "Deleting…" : "Closing…"}
          onAction={async () => {
            // The outcome, good or bad, is the screen's own status line below.
            await close(confirming.id, confirming.remove);
            setConfirming(null);
          }}
          onSafe={() => setConfirming(null)}
        />
      )}
      {outbound && (
        <Dialog onClose={() => setOutbound(null)} labelledBy="outbound-title">
          <h2 id="outbound-title">
            Continue to {new URL(outbound.url).hostname}?
          </h2>
          <p>
            You’re leaving HisFullGlory to view {outbound.title}. The provider
            handles payment, verification, transfers, refunds and receipts under
            its own terms.
          </p>
          {outbound.choice && <p>Choose “{outbound.choice}” at checkout.</p>}
          <p>We do not collect this payment or promise tax deductibility.</p>
          <a
            className="button"
            href={outbound.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track("giving_outbound", {
                domain: new URL(outbound.url).hostname,
              });
              setOutbound(null);
            }}
          >
            Continue to provider
          </a>
          <button className="secondary" onClick={() => setOutbound(null)}>
            Stay here
          </button>
        </Dialog>
      )}
    </section>
  );
}
