import { safeSourceUrl } from './sources.ts';
export interface Circle {
  id: string; slug: string; name: string; description: string; privacy: "public" | "private";
  topic_id: string | null; application_question: string; created_at: string;
  role: "owner" | "moderator" | "member" | null;
  membership: "pending" | "active" | "declined" | "left" | "removed" | null;
  member_count: number | null;
}
export interface CircleMember { id: string; display_name: string; state: string; role: string; is_self: boolean; answer: string | null }
export interface CirclePost {
  id: string; display_name: string; body: string; post_type: string; created_at: string; source_path: string | null;
  is_owner: boolean; score: number; upvotes: number; voted: boolean; helped: number; reputation: number | null;
  replies: number; sources: { title: string; url: string }[];
}
export interface CircleReport { id: string; target_id: string; category: string; status: string; body: string; display_name: string; moderation_state: string }

export interface CircleRpcResults {
 read_circles: Circle[]; read_circle_discussions: CirclePost[]; read_circle_thread: CirclePost | null;
 read_own_circle_application: {state: string; answer: string | null} | null;
 read_circle_members: CircleMember[]; read_circle_reports: CircleReport[];
 create_circle: string; publish_circle_post: string;
 edit_circle: null; close_circle: null; change_circle_membership: null; review_circle_member: null;
 set_contribution_vote: null; react_community_post: null; delete_community_post: null;
 community_safety_action: null; moderate_circle_post: null;
}
export type CircleRpcName = keyof CircleRpcResults;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string';
const uuid = (v: unknown) => string(v) && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown) => string(v) && Number.isFinite(Date.parse(v));
const states = ['pending','active','declined','left','removed'];
const roles = ['owner','moderator','member'];
const oneOf = (v: unknown, values: readonly string[]) => string(v) && values.includes(v);
const nullableString = (v: unknown) => v === null || string(v);
const list = (v: unknown, validate: (item: unknown) => boolean) => Array.isArray(v) && v.length <= 20 && v.every(validate);
function circle(v: unknown): boolean {
 return record(v) && uuid(v.id) && string(v.slug) && /^[a-z][a-z0-9-]{2,59}$/.test(v.slug) &&
 string(v.name) && string(v.description) && oneOf(v.privacy,['public','private']) && nullableString(v.topic_id) &&
 string(v.application_question) && date(v.created_at) && (v.role === null || oneOf(v.role,roles)) &&
 (v.membership === null || oneOf(v.membership,states)) && (v.member_count === null || count(v.member_count));
}
function post(v: unknown): boolean {
 return record(v) && uuid(v.id) && string(v.display_name) && string(v.body) &&
 oneOf(v.post_type,['question','advice','scripture','resource','reflection','encouragement','testimony','prayer','memory']) &&
 date(v.created_at) && nullableString(v.source_path) && typeof v.is_owner === 'boolean' &&
 [v.score,v.upvotes,v.helped,v.replies].every(count) && typeof v.voted === 'boolean' &&
 (v.reputation === null || count(v.reputation)) && Array.isArray(v.sources) && v.sources.length <= 5 &&
 v.sources.every(s => record(s) && string(s.title) && string(s.url) && !!safeSourceUrl(s.url));
}
function member(v: unknown): boolean {
 return record(v) && uuid(v.id) && string(v.display_name) && oneOf(v.state,states) && oneOf(v.role,roles) &&
 typeof v.is_self === 'boolean' && nullableString(v.answer) && (v.state === 'pending' || v.answer === null);
}
function report(v: unknown): boolean {
 return record(v) && uuid(v.id) && uuid(v.target_id) && string(v.category) && string(v.status) &&
 string(v.body) && string(v.display_name) && oneOf(v.moderation_state,['visible','pending_review','hidden','removed']);
}
// Validate untrusted RPC output before it enters rendering. No caller-supplied result casts.
export function validCircleResult<N extends CircleRpcName>(name: N, data: unknown): data is CircleRpcResults[N] {
 switch(name) {
 case 'read_circles': return list(data,circle);
 case 'read_circle_discussions': return list(data,post);
 case 'read_circle_thread': return data === null || post(data);
 case 'read_circle_members': return list(data,member);
 case 'read_circle_reports': return list(data,report);
 case 'read_own_circle_application': return data === null || record(data) && oneOf(data.state,states) && nullableString(data.answer) && (data.state === 'pending' || data.answer === null);
 case 'create_circle': case 'publish_circle_post': return uuid(data);
 default: return data === null;
 }
}
