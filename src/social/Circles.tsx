import { useEffect, useRef, useState } from "react";
import { useAuth } from "../platform/auth";
import { detectCapabilities } from "../platform/capabilities";
import { supabase } from "../supabase";
import { navigate } from "../platform/router";
import { findTopic, launchTopics } from "../topics/graph";
import { safeSourceUrl } from "./sources";
import { SafetyControls } from "./safety";
import { circleRpc, type Circle, type CircleMember, type CirclePost, type CircleReport, type CircleRpcName } from "./circlesApi";

export function Circles({ slug, thread }: { slug?: string; thread?: string }) {
  const { session, accepted } = useAuth();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [root, setRoot] = useState<CirclePost | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [reports, setReports] = useState<CircleReport[]>([]);
  const [queue, setQueue] = useState("pending");
  const [topic, setTopic] = useState("");
  const [ownOnly, setOwnOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const [queueMore, setQueueMore] = useState(false);
  const [reportMore, setReportMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [question, setQuestion] = useState("");
  const [ownAnswer, setOwnAnswer] = useState("");
  const [reviewOpen,setReviewOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("question");
  const [anonymous, setAnonymous] = useState(false);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [passage, setPassage] = useState("");
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<(() => void) | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const circle = slug ? circles[0] : undefined;
  const configured = detectCapabilities(Boolean(supabase)).circles;
  const canRead = circle?.privacy === "public" || !!circle?.role;
  const canWrite = !!session && accepted && !!circle?.role;
  const moderator = circle?.role === "owner" || circle?.role === "moderator";
  const path = "/community/circles/" + (slug ?? "");
  const refresh = () => setRevision(n => n + 1);
  function clearServerData() { sequence.current++; setPosts([]); setRoot(null); setMembers([]); setReports([]); setCircles([]); setLoaded(false); setOwnAnswer(""); }
  useEffect(() => {
    const invalidate = () => { clearServerData(); refresh(); };
    const offline = () => { clearServerData(); setBusy(false); setStatus("Offline. Circle content and actions need a connection; no offline copy is stored."); };
    const visible = () => { if (document.visibilityState === "visible") invalidate(); else clearServerData(); };
    window.addEventListener("hfg-blocks-changed", invalidate);
    window.addEventListener("focus", invalidate);
    window.addEventListener("online", invalidate);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => { if (!busyRef.current && document.visibilityState === "visible" && navigator.onLine) invalidate(); }, 30000);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener("hfg-blocks-changed", invalidate); window.removeEventListener("focus", invalidate); window.removeEventListener("online", invalidate); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); };
  }, []);
  async function load(append = false) {
    const request = ++sequence.current;
    setBusy(true); setStatus("");
    try {
      const lastCircle = append && !slug ? circles.at(-1) : undefined;
      const rows = await circleRpc("read_circles", { selected_slug: slug ?? null, selected_topic: slug ? null : topic || null, own_only: slug ? false : ownOnly, before_time: lastCircle?.created_at ?? null, before_id: lastCircle?.id ?? null });
      if (request !== sequence.current) return;
      setCircles(old => append && !slug ? [...old, ...rows.filter(c => !old.some(o => o.id === c.id))] : rows);
      setLoaded(true); setMore(!slug && rows.length === 20);
      const c = rows[0];
      if (slug && c) {
        if (c.privacy === "private" && c.membership === "pending" && session) {
          const application = await circleRpc("read_own_circle_application",{selected_circle:c.id});
          if (request !== sequence.current) return;
          setOwnAnswer(application?.answer ?? "");
        } else setOwnAnswer("");

        if (c.privacy === "public" || c.role) {
          let original: CirclePost | null = null;
          if (thread) original = await circleRpc("read_circle_thread", { selected_circle: c.id, thread_id: thread });
          const last = append ? posts.at(-1) : undefined;
          const contributions = thread && !original ? [] : await circleRpc("read_circle_discussions", { selected_circle: c.id, reply_to: thread ?? null, before_time: last?.created_at ?? null, before_id: last?.id ?? null });
          if (request !== sequence.current) return;
          setRoot(original); setPosts(old => append ? [...old, ...contributions.filter(p => !old.some(o => o.id === p.id))] : contributions); setMore(contributions.length === 20);
          if (thread && !original) setStatus("This thread is unavailable, removed or blocked.");
        } else { setPosts([]); setRoot(null); }
        if (c.role === "owner" || c.role === "moderator") {
          const memberRows = await circleRpc("read_circle_members", { selected_circle: c.id, queue });
          const reportRows = await circleRpc("read_circle_reports", { selected_circle: c.id });
          if (request !== sequence.current) return;
          setMembers(memberRows); setQueueMore(memberRows.length === 20); setReports(reportRows); setReportMore(reportRows.length === 20);
        } else { setMembers([]); setReports([]); }
      } else { setPosts([]); setRoot(null); setMembers([]); setReports([]); }
    } catch (error) {
      if (request !== sequence.current) return;
      setCircles([]); setPosts([]); setRoot(null); setMembers([]); setReports([]); setMore(false); setLoaded(false);
      setStatus(error instanceof Error ? error.message : "Circles unavailable. Retry after checking access.");
    } finally { if (request === sequence.current) setBusy(false); }
  }
  useEffect(() => { clearServerData(); if (configured) void load(); }, [slug, thread, topic, ownOnly, queue, revision, session?.user.id, session?.access_token, accepted]);
  useEffect(() => { setBody(""); setAnswer(""); setSourceTitle(""); setSourceUrl(""); setPassage(""); setEditing(false); setCreating(false); setReviewOpen(false); setName(""); setDescription(""); setQuestion(""); }, [slug, thread, session?.user.id]);
  async function action(name: CircleRpcName, args: Record<string, unknown>, after?: (result: unknown) => void) {
    if (busy) return;
    const request = sequence.current;
    setBusy(true); setStatus("");
    try {
      const result = await circleRpc(name, args);
      if (request !== sequence.current) return;
      after?.(result); clearServerData(); refresh();
    } catch (error) { if (request === sequence.current) setStatus(error instanceof Error ? error.message : "Action unavailable."); }
    finally { if (request === sequence.current) setBusy(false); }
  }
  async function pageQueue(reportsQueue: boolean) {
    if (!circle || busy) return;
    const request = sequence.current;setBusy(true);
    try {
      if (reportsQueue) {
        const rows = await circleRpc("read_circle_reports", { selected_circle: circle.id, after_id: reports.at(-1)?.id ?? null });
        if (request !== sequence.current) return;setReports(old => [...old, ...rows]); setReportMore(rows.length === 20);
      } else {
        const rows = await circleRpc("read_circle_members", { selected_circle: circle.id, queue, after_id: members.at(-1)?.id ?? null });
        if (request !== sequence.current) return;setMembers(old => [...old, ...rows]); setQueueMore(rows.length === 20);
      }
    } catch { if (request === sequence.current) {setMembers([]);setReports([]);setStatus("Review queue unavailable. Refresh to recheck access.");} }
    finally { if (request === sequence.current) setBusy(false); }
  }
  function confirmAction(text: string, run: () => void) { confirmation.current = run;setConfirmText(text);dialog.current?.showModal(); }
  const review = (m: CircleMember, review_action: string) => confirmAction(`${review_action} ${m.display_name}?`, () => void action("review_circle_member", { selected_circle: circle?.id, membership_id: m.id, review_action }));
  return <section className="circles"><button className="text-button" onClick={() => navigate(slug ? "/community/circles" : "/community")}>{slug ? "← Circles" : "← Community"}</button>
    <h1>{circle?.name ?? "Circles"}</h1><p>Walk together around Scripture and shared encouragement. Members' experiences and votes are not Biblical authority or verified expertise.</p>
    {!configured ? <p>Live Circles are not configured. No sample memberships or discussions are shown.</p> : <>
      <p role="status">{status || (busy ? "Loading…" : "")}</p><button className="secondary" disabled={busy} onClick={() => void load()}>Refresh Circles</button>
      {!session && <p>Sign in from <button className="text-button" onClick={() => navigate("/profile")}>Profile</button> to discover private Circles or join. Public discussions can be read without signing in.</p>}
      {session && !accepted && <p>Accept the current Community Guidelines in Profile before creating, joining or posting.</p>}
      {!slug ? <>
        <label>Filter by topic<select value={topic} onChange={e => setTopic(e.target.value)}><option value="">All topics</option>{launchTopics.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label>Find in this page<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={ownOnly} disabled={!session} onChange={e => setOwnOnly(e.target.checked)} />My active Circles</label>
        {!busy && loaded && !circles.length && <p>No Circles match. There is no seeded activity.</p>}
        {circles.filter(c => (c.name + " " + c.description).toLowerCase().includes(query.toLowerCase())).map(c => <button className="card entry" key={c.id} onClick={() => navigate("/community/circles/" + c.slug)}><strong>{c.name}</strong><span>{c.privacy === "private" ? "Private · application required" : "Public · join to contribute"} {c.topic_id && "· " + findTopic(c.topic_id)?.label}</span><span>{c.description}</span></button>)}
        <button disabled={!session || !accepted || busy} onClick={() => {setCreating(!creating);setEditing(false);}}>Create a Circle</button>
      </> : circle ? <>
        <p className="preserve">{circle.description}</p><p>{circle.privacy === "private" ? "Private discussions · active members only" : "Public discussions · visible to everyone"} {circle.topic_id && "· " + findTopic(circle.topic_id)?.label}</p>
        <p>Membership: {circle.membership ?? "not joined"}{circle.role && " · " + circle.role}{circle.member_count !== null && " · " + circle.member_count + " active members"}</p>
        {circle.privacy === "private" && !circle.role && <p>Only this description and application question are discoverable when signed in. Discussions, member identities and member totals are not shown.</p>}
        {circle.membership === "pending" ? <><p>Application pending. Only you and this Circle's owner/moderators can read your answer; it is erased after approval, decline or withdrawal.</p><p className="preserve">{ownAnswer}</p></> : circle.membership === "removed" ? <p>Your membership was removed. You cannot restore it yourself in v1.</p> : !circle.role && session && accepted ? <form className="card" onSubmit={e => {e.preventDefault();void action("change_circle_membership", { selected_circle: circle.id, membership_action: circle.privacy === "public" ? "join" : "apply", application_answer: answer }, () => setAnswer(""));}}>
          {circle.privacy === "private" && <><h2>Apply to this Circle</h2><p className="preserve">{circle.application_question || "An optional introduction"}</p><label>Private application answer · optional<textarea maxLength={1000} value={answer} onChange={e => setAnswer(e.target.value)} /></label><small>Visible only to you and the current Circle owner/moderators. Avoid sensitive identity details. Erased after review or withdrawal.</small></>}
          <button disabled={busy}>{circle.privacy === "public" ? "Join Circle" : "Submit application"}</button>
        </form> : null}
        {(circle.role && circle.role !== "owner" || circle.membership === "pending") && <button className="secondary" disabled={busy} onClick={() => confirmAction(circle.membership === "pending" ? "Withdraw this application and erase your answer?" : "Leave this Circle? Private discussions will become unavailable.", () => void action("change_circle_membership", { selected_circle: circle.id, membership_action: "leave" }))}>{circle.membership === "pending" ? "Withdraw application" : "Leave Circle"}</button>}
        {circle.role === "owner" && <><button className="secondary" disabled={busy} onClick={() => {setName(circle.name);setDescription(circle.description);setQuestion(circle.application_question);setEditing(!editing);}}>Edit Circle details</button><button className="secondary" disabled={busy} onClick={() => confirmAction("Close this Circle permanently in v1? All discussions become unavailable and pending answers are erased.", () => void action("close_circle", { selected_circle: circle.id }))}>Close Circle</button><p>The owner cannot leave or transfer ownership in v1. Privacy and the URL cannot be changed.</p></>}
        {canRead && <>
          {thread && <button className="secondary" onClick={() => navigate(path)}>Back to Circle discussions</button>}
          {!busy && !posts.length && !root && <p>No visible discussions here yet.</p>}
          {[...(root ? [root] : []), ...posts].map(p => <article className="card" key={p.id}><h2>{p.display_name}</h2><small>{p.post_type} · {new Date(p.created_at).toLocaleDateString()}</small><p className="preserve">{p.body}</p>
            {p.source_path && /^\/(bible\/[a-z0-9-]+\/[1-9][0-9]*(\/[1-9][0-9]*)?|grow\/[a-z0-9-]+)$/.test(p.source_path) && <button className="text-button" onClick={() => navigate(p.source_path!)}>Open linked Scripture / devotional</button>}
            {p.reputation !== null && <p>Public community reputation · {p.reputation} · usefulness, not spiritual worth</p>}
            {p.sources.filter(s => safeSourceUrl(s.url)).map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} · {new URL(s.url).hostname}</a><small>Member-supplied source · not independently verified</small></p>)}
            <div className="actions"><button className="secondary" disabled={busy || !canWrite || p.is_owner} aria-pressed={p.voted} onClick={() => void action("set_contribution_vote", { contribution_id: p.id, voting: !p.voted })}>{p.voted ? "Remove upvote" : "Upvote"} · {p.upvotes}</button>{["helped", "amen", "praying"].map(reaction => <button className="secondary" key={reaction} disabled={busy || !canWrite} onClick={() => void action("react_community_post", { post_id: p.id, reaction_name: reaction })}>{reaction === "helped" ? "This helped me · " + p.helped : reaction === "amen" ? "Amen" : "Praying"}</button>)}
              {!thread && <button onClick={() => navigate(path + "?thread=" + p.id)}>Open discussion · {p.replies} replies</button>}
              <button className="secondary" onClick={() => {if (!navigator.clipboard) {setStatus("Copy unavailable. Use the address bar to share this link.");return;}void navigator.clipboard.writeText(window.location.origin + path + "?thread=" + (thread ?? p.id)).then(() => setStatus("Link copied. Private content still requires membership."), () => setStatus("Copy unavailable. Use the address bar to share this link."));}}>Copy discussion link</button>
              {p.is_owner && <button className="secondary" disabled={busy} onClick={() => confirmAction("Delete your contribution? Replies will no longer be visible.", () => void action("delete_community_post", { post_id: p.id }))}>Delete my contribution</button>}
            </div><SafetyControls id={p.id} kind="post" onChange={refresh} execute={async args => { await circleRpc("community_safety_action", args); }} />
          </article>)}
          {canWrite && (!thread || root) && <form className="card" onSubmit={e => {e.preventDefault();if (!!sourceTitle !== !!sourceUrl || sourceUrl && !safeSourceUrl(sourceUrl)) {setStatus("Use both a source title and safe HTTPS URL, or leave both empty.");return;}void action("publish_circle_post", { selected_circle: circle.id, post_body: body.trim(), post_kind: kind, reply_to: thread ?? null, source_items: sourceUrl ? [{ title: sourceTitle.trim(), url: sourceUrl }] : [], anonymous, passage_path: passage || null }, () => {setBody("");setSourceTitle("");setSourceUrl("");setPassage("");});}}>
            <h2>{thread ? "Reply in this Circle" : "Start a Circle discussion"}</h2><p>{circle.privacy === "private" ? "Visible to active members; moderators can review reported content." : "Visible publicly."} Anonymous display retains accountable backend ownership.</p>
            <label>Contribution type<select value={kind} onChange={e => setKind(e.target.value)}>{["question", "advice", "scripture", "resource", "reflection", "encouragement", "testimony", "prayer", "memory"].map(k => <option key={k}>{k}</option>)}</select></label>
            <label>Your Circle contribution<textarea required minLength={3} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} /></label>
            <label>Source title · optional<input maxLength={200} value={sourceTitle} onChange={e => setSourceTitle(e.target.value)} /></label><label>Source HTTPS URL · optional<input type="url" maxLength={2000} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></label>
            <label>Scripture / devotional path · optional<input maxLength={160} pattern="/(bible/[a-z0-9\-]+/[1-9][0-9]*(/[1-9][0-9]*)?|grow/[a-z0-9\-]+)" placeholder="/bible/romans/8/28" value={passage} onChange={e => setPassage(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />Display anonymously</label><button disabled={busy || body.trim().length < 3}>Publish to Circle</button>
          </form>}
        </>}
        {moderator && <details className="card" open={reviewOpen} onToggle={e => setReviewOpen(e.currentTarget.open)}><summary>Circle moderation · scoped to this Circle</summary><p>Application answers are private to the applicant and current owner/moderators, and erased after review. Names below are membership snapshots, not verified identities. Blocking an author does not hide reports from authorized Circle reviewers.</p>
          <label>Review list<select value={queue} onChange={e => setQueue(e.target.value)}><option value="pending">Pending applications</option><option value="active">Active members</option></select></label>
          {!members.length && <p>No entries in this review list.</p>}{members.map(m => <article className="card" key={m.id}><h2>{m.display_name}</h2><p>{m.role} · {m.state}</p>{m.answer && <p className="preserve">{m.answer}</p>}<div className="actions">{m.state === "pending" ? ["approve", "decline"].map(a => <button key={a} disabled={busy} onClick={() => review(m, a)}>{a === "approve" ? "Approve application" : "Decline application"}</button>) : m.role !== "owner" && !m.is_self ? <><button disabled={busy || circle.role === "moderator" && m.role !== "member"} onClick={() => review(m, "remove")}>Remove member</button>{circle.role === "owner" && <button className="secondary" disabled={busy} onClick={() => review(m, m.role === "moderator" ? "demote" : "promote")}>{m.role === "moderator" ? "Demote moderator" : "Promote moderator"}</button>}</> : <p>{m.role === "owner" ? "Owner membership is protected." : "Your own role cannot be changed here."}</p>}</div></article>)}
          {queueMore && <button disabled={busy} onClick={() => void pageQueue(false)}>Load more members</button>}
          <h2>Reported and moderated contributions</h2><p>Reporter identities and private report details are reserved for platform operators.</p>{!reports.length && <p>No open reports or moderated contributions.</p>}{reports.map(r => <article className="card" key={r.id}><h3>{r.display_name} · {r.category}</h3><p className="preserve">{r.body}</p><p>{r.moderation_state}</p><div className="actions">{["hidden", "removed", "visible"].map(s => <button className="secondary" disabled={busy} key={s} onClick={() => confirmAction(`Mark this Circle contribution ${s} and resolve its reports?`, () => void action("moderate_circle_post", { selected_circle: circle.id, post_id: r.target_id, new_state: s }))}>{s === "visible" ? "Keep visible" : s === "hidden" ? "Hide contribution" : "Remove contribution"}</button>)}</div></article>)}{reportMore && <button disabled={busy} onClick={() => void pageQueue(true)}>Load more reports</button>}
        </details>}
      </> : loaded && !busy ? <p>Circle unavailable. It may be private, closed, deleted or not found. No private content is disclosed.</p> : null}
      {(creating || editing) && <form className="card" onSubmit={e => {e.preventDefault();void action(editing ? "edit_circle" : "create_circle", editing ? { selected_circle: circle?.id, circle_name: name, circle_description: description, question } : { circle_slug: newSlug, circle_name: name, circle_description: description, circle_privacy: privacy, selected_topic: topic || null, question }, () => {setCreating(false);setEditing(false);if (!editing) navigate("/community/circles/" + newSlug);});}}>
        <h2>{editing ? "Edit Circle details" : "Create a Circle"}</h2><label>Circle name<input required minLength={3} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><label>Description<textarea required minLength={10} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        {!editing && <><label>URL slug · immutable<input required pattern="[a-z][a-z0-9\-]{2,59}" minLength={3} maxLength={60} value={newSlug} onChange={e => setNewSlug(e.target.value)} /></label><label>Privacy · immutable<select value={privacy} onChange={e => setPrivacy(e.target.value)}><option value="public">Public · everyone can read</option><option value="private">Private · application and approval</option></select></label><p>Optional topic uses the topic filter above. Names and descriptions are discoverable; do not put private information here.</p></>}
        <label>Application question · optional, discoverable<textarea maxLength={300} value={question} onChange={e => setQuestion(e.target.value)} /></label><button disabled={busy || !accepted}>{editing ? "Save Circle details" : "Create Circle"}</button><button type="button" className="secondary" onClick={() => {setEditing(false);setCreating(false);}}>Cancel</button>
      </form>}
      {more && <button disabled={busy} onClick={() => void load(true)}>Load more {slug ? "discussions" : "Circles"}</button>}
    </>}
    <dialog ref={dialog} className="card dialog" aria-labelledby="circle-confirm-title" onClose={() => {confirmation.current = null;}}><h2 id="circle-confirm-title">Confirm Circle action</h2><p>{confirmText}</p><div className="actions"><button autoFocus className="secondary" onClick={() => dialog.current?.close()}>Cancel</button><button onClick={() => {const run = confirmation.current;confirmation.current = null;dialog.current?.close();run?.();}}>Confirm</button></div></dialog>
  </section>;
}
