// The sponsor slot (founder decision, 2026-10-19, D-13): built for later, empty and invisible at
// launch. No house messages, no ad network, no tracking. Where a sponsor message may ever appear
// is the founder's open decision, so this file makes no promise about any place.
//
// The same shape and the same rule as the app's src/config.ts. The site is built ahead of
// time, so "until" is checked when the site is built.

export type SponsorPlace =
  | "today-end"
  | "story-end"
  | "site-home-end"
  | "site-context-check-end"
  | "pray"
  | "community";

export interface Sponsor {
  /** At most 40 characters. */
  name: string;
  /** At most 90 characters. */
  line: string;
  /** An https address. Its host is also listed in outboundHosts (site/src/data/legal.ts). */
  url: string;
  /** The last day it shows, "YYYY-MM-DD". */
  until: string;
  places: SponsorPlace[];
}

/**
 * The sponsor to show at a place, or null. Null means: render nothing at all, no wrapper, no
 * word "Sponsor", no space. A sponsor shows only when it is set, lists the place, has not run
 * out, and links to an https address.
 */
export function sponsorFor(place: SponsorPlace, sponsor: Sponsor | null, today: string): Sponsor | null {
  if (!sponsor) return null;
  if (!sponsor.places.includes(place)) return null;
  if (today > sponsor.until) return null;
  if (!sponsor.url.startsWith("https://")) return null;
  return sponsor;
}
