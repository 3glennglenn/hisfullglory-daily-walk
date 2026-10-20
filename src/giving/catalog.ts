import { catalogEntries } from "./catalogData.ts";

// The pages of the Give screen, in the order the reader meets them. The first page holds the options where
// independent evaluators expect a gift to do the most good across different needs (founder, 2026-10-20).
export const givingPages = [
  {
    id: "most-effective",
    title: "Most effective",
    intro: "Six places where independent evaluators expect a gift to do the most good, across different needs.",
  },
  {
    id: "poverty-hunger",
    title: "Poverty and hunger",
    intro: "Cash, farming, fortified food and treatment for malnourished children.",
  },
  {
    id: "health-research",
    title: "Health, medicine and research",
    intro: "Malaria, neglected diseases, sight, childbirth injuries and research into new programmes.",
  },
  {
    id: "children-protection",
    title: "Children and protection",
    intro: "Vaccines, vitamins, school meals and protection from trafficking.",
  },
  {
    id: "animals",
    title: "Animals",
    intro: "Charities recommended by Animal Charity Evaluators for reducing the suffering of farmed and wild animals.",
  },
  {
    id: "christian",
    title: "Christian charities",
    intro:
      "Christian organisations serving people in need. Charity Navigator and ECFA check their finances and accountability, not how much good each gift does.",
  },
] as const;
export type GivingPageId = (typeof givingPages)[number]["id"];
export type GivingPage = { id: GivingPageId; title: string; intro: string };

export type Evaluator =
  | "GiveWell"
  | "The Life You Can Save"
  | "Happier Lives Institute"
  | "Animal Charity Evaluators"
  | "Charity Navigator"
  | "ECFA";

/** One charity as written in catalogData.ts. */
export interface CauseEntry {
  id: string;
  title: string;
  page: GivingPageId;
  description: string;
  donationUrl: string;
  /** Set when several charities share one checkout (secure.givewell.org): the name the donor picks there. */
  checkoutChoice?: string;
  sourceUrl: string;
  /** The evaluator's own words, as found on the source page. */
  evidence: string;
  evaluator: Evaluator;
  christian: boolean;
  verifiedOn: string;
  /** Where gifts are tax-deductible or processed, as the charity says it. */
  countriesNote?: string;
}

/** A charity as the app reads it: the entry plus its page's title as `category`. */
export interface Cause extends CauseEntry {
  category: string;
}

const pageTitles = new Map<string, string>(givingPages.map((p) => [p.id, p.title]));

export const causes: Cause[] = catalogEntries.map((entry) => ({
  ...entry,
  category: pageTitles.get(entry.page) ?? entry.page,
}));

/** The pages with their charities, in page order, each charity in the order of catalogData.ts. */
export function causesByPage(list: readonly Cause[] = causes): (GivingPage & { causes: Cause[] })[] {
  return givingPages.map((page) => ({
    id: page.id,
    title: page.title,
    intro: page.intro,
    causes: list.filter((c) => c.page === page.id),
  }));
}

/**
 * The short line that says why a charity is listed, from the evaluator that backs it. Happier Lives
 * Institute and Charity Navigator say more in their own words, so those two read the evidence.
 */
export function whyListed(cause: Pick<Cause, "evaluator" | "evidence">): string {
  switch (cause.evaluator) {
    case "GiveWell":
      return "Recommended by GiveWell";
    case "The Life You Can Save":
      return "Recommended by The Life You Can Save";
    case "Animal Charity Evaluators":
      return "Recommended by Animal Charity Evaluators";
    case "Happier Lives Institute":
      return /promising/i.test(cause.evidence)
        ? "Promising charity, Happier Lives Institute"
        : "Top charity, Happier Lives Institute";
    case "Charity Navigator": {
      const score = /(\d{1,3})%/.exec(cause.evidence)?.[1];
      return score ? `Charity Navigator: Four-Star, ${score}%` : "Charity Navigator: Four-Star";
    }
    case "ECFA":
      return "ECFA accredited";
  }
}

export const supportCategories = [
  "Medical & care",
  "Basic needs",
  "Education",
  "Family emergency",
  "Community service",
] as const;
export function approvedFundraiserUrl(value: string): boolean {
  return /^https:\/\/www\.gofundme\.com\/f\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(
    value,
  );
}
export function supportExpiry(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T23:59:59Z");
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso.slice(0, 10) === value ? iso : null;
}
export interface CharityCatalogProvider {
  list(category?: string): Cause[];
  get(id: string): Cause | undefined;
}
export const curatedCharityCatalog: CharityCatalogProvider = {
  list(category) {
    return causes
      .filter((c) => !category || c.category === category)
      .map((c) => ({ ...c }));
  },
  get(id) {
    const cause = causes.find((c) => c.id === id);
    return cause ? { ...cause } : undefined;
  },
};
export interface ExternalFundraisingProvider {
  id: string;
  helpUrl: string;
  accepts(url: string): boolean;
}
export const goFundMeProvider: ExternalFundraisingProvider = {
  id: "gofundme",
  helpUrl: "https://www.gofundme.com/c/how-it-works",
  accepts: approvedFundraiserUrl,
};
export function hasPaymentDetails(value: string): boolean {
  return /(?:https?:\/\/|www\.|paypal|cashapp|cash\s*app|venmo|crypto|bitcoin|ethereum|wallet\s*address|bank\s*account|routing\s*number|account\s*number|card\s*number|rekeningnummer|wire\s*transfer|bank\s*transfer|\b(?:\d[ -]?){13,19}\b|\bIBAN\b|\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b|\b0x[a-f0-9]{40}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|\bbc1[a-z0-9]{25,90}\b)/i.test(
    value,
  );
}
export type SupportStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "fundraising"
  | "funded"
  | "closed"
  | "rejected";
export interface SupportRequest {
  id: string;
  title: string;
  story: string;
  category: string;
  declared_target: number;
  currency: string;
  expires_at: string;
  beneficiary_relationship: string;
  country: string;
  is_anonymous: boolean;
  fundraiser_url: string;
  status: SupportStatus;
  display_name: string;
  created_at: string;
}
