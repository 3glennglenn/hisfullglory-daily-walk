// Server integration contracts only. No client can grant entitlements or credentials.
export type Entitlement = "advanced-study" | "audio-devotionals" | "courses" | "family-tools";
export interface EntitlementProvider {
  // A future backend must authenticate the caller and verify provider events.
  forCurrentAccount(): Promise<readonly Entitlement[]>;
}
export interface Organization {
  id:string; kind:"church"|"creator"; name:string;
  verification:"not-reviewed"|"pending"|"verified"|"rejected";
}
export type OrganizationRole = "member"|"moderator"|"owner";
export interface ContributorApplication {
  id:string; accountId:string; claimedTopics:readonly string[];
  status:"draft"|"submitted"|"under-review"|"approved"|"rejected"|"revoked";
}
export interface ContributorVerificationProvider {
  submit(claimedTopics:readonly string[]):Promise<ContributorApplication>;
  currentApplication():Promise<ContributorApplication|null>;
  // Deliberately no client approval, role, badge or payout setter.
}
// Lived experience is an unverified personal statement, independent of votes.
export interface LivedExperience {topicId:string; statement:string; label:"self-described, not verified";}
