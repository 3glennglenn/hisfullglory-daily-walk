// Fixture, never imported by the production application. Renders the real Today screen the way the app does, inside
// the platform store, on a list of context checks that the test supplies in window.todayFixture.files: the test's
// bundle replaces ../context/data (which needs Vite's import.meta.glob) with that list.
import { createRoot } from "react-dom/client";
import { PlatformProvider } from "../../src/platform/store";
import { Today } from "../../src/features/Today";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <PlatformProvider>
    <div className="shell">
      <main id="main">
        <Today />
      </main>
    </div>
  </PlatformProvider>,
);
