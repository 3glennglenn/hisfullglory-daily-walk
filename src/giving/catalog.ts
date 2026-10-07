export interface Cause {
  id: string;
  title: string;
  category: string;
  description: string;
  donationUrl: string;
  sourceUrl: string;
  verifiedOn: string;
  checkoutChoice: string;
}
export const causes: Cause[] = [
  [
    "top-charities",
    "GiveWell Top Charities Fund",
    "Flexible giving",
    "Let GiveWell allocate your gift among its recommended charities as funding opportunities change.",
    "Top Charities Fund",
  ],
  [
    "malaria-consortium",
    "Malaria Consortium",
    "Malaria prevention",
    "Supports seasonal preventive malaria medicine for children in eligible regions.",
    "Malaria Consortium",
  ],
  [
    "against-malaria",
    "Against Malaria Foundation",
    "Malaria prevention",
    "Supports distribution of insecticide-treated bed nets to reduce malaria exposure.",
    "Against Malaria Foundation",
  ],
  [
    "helen-keller",
    "Helen Keller Intl",
    "Child nutrition",
    "Supports vitamin A supplementation programs for children.",
    "Helen Keller Intl",
  ],
  [
    "new-incentives",
    "New Incentives",
    "Child immunization",
    "Supports incentives that help families access routine childhood vaccinations.",
    "New Incentives",
  ],
].map(([id, title, category, description, checkoutChoice]) => ({
  id,
  title,
  category,
  description,
  checkoutChoice,
  donationUrl: "https://secure.givewell.org/",
  sourceUrl: "https://www.givewell.org/charities/top-charities",
  verifiedOn: "2026-10-07",
}));
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
