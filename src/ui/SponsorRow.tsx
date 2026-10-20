import { ExternalLink } from "lucide-react";
import { config, sponsorFor, type Sponsor, type SponsorPlace } from "../config";
import { localDate } from "../storage";

// The sponsor slot (UI-SPEC 13, founder decision D-13 of 2026-10-19): built for later, empty and invisible at
// launch. One row that a screen can mount at a named place; it renders only when the configured sponsor lists
// that place, has not run out and links to an https address. With no sponsor it renders NOTHING: no wrapper, no
// heading, no reserved space, no house message. Where a sponsor may ever appear is the founder's open decision, so
// no place is promised or excluded here.
//
// No tracking: the link is marked as sponsored and opens without an opener, with the address exactly as configured (no parameters
// added), and the row holds no image, script, cookie or analytics event. Nothing about the reader goes to the
// sponsor, and the line under the row says so.
export function SponsorRow({
  place,
  sponsor = config.sponsor,
  today = localDate(),
}: {
  place: SponsorPlace;
  /** The configured sponsor; a test passes its own. */
  sponsor?: Sponsor | null;
  today?: string;
}) {
  const shown = sponsorFor(place, sponsor, today);
  if (!shown) return null;
  return (
    <div className="group sponsor" data-slot="sponsor">
      <div className="group-list">
        <a className="list-row" href={shown.url} target="_blank" rel="sponsored noopener">
          <span className="list-row-text">
            <span className="sponsor-label">Sponsor</span>
            <span className="list-row-title">{shown.name}</span>
            <span className="sponsor-line">{shown.line}</span>
          </span>
          <ExternalLink className="list-row-chevron" aria-hidden="true" focusable="false" size={20} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p className="group-note">Sponsors do not receive anything about you.</p>
    </div>
  );
}
