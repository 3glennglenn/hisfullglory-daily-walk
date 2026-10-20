// Fixture, never imported by the production application. Renders SponsorRow once for each of the six candidate
// places with no sponsor, and once more for each with a fixture sponsor that lists only "today-end" (UI-SPEC 13).
import { createRoot } from "react-dom/client";
import { SponsorRow } from "../../src/ui/SponsorRow";
import type { Sponsor, SponsorPlace } from "../../src/config";
import "../../src/styles.css";

const places: SponsorPlace[] = ["today-end", "story-end", "site-home-end", "site-context-check-end", "pray", "community"];
const sponsor: Sponsor = {
  name: "Fixture Sponsor",
  line: "A line a sponsor would write.",
  url: "https://sponsor.example/path",
  until: "2026-12-31",
  places: ["today-end"],
};

createRoot(document.getElementById("root")!).render(
  <div className="shell">
    <main id="main">
      <div id="empty">
        {places.map((place) => (
          <div key={place} data-place={place}>
            <SponsorRow place={place} sponsor={null} today="2026-10-20" />
          </div>
        ))}
      </div>
      <div id="set">
        {places.map((place) => (
          <div key={place} data-place={place}>
            <SponsorRow place={place} sponsor={sponsor} today="2026-10-20" />
          </div>
        ))}
      </div>
    </main>
  </div>,
);
