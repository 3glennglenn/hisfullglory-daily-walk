import { createRoot } from "react-dom/client";
import { AuthProvider } from "../../src/platform/auth";
import { PrivateProfileBoundary } from "../../src/platform/PrivateProfile";
import { parseRoute } from "../../src/platform/router";
import { Reader } from "../../src/bible/Reader";
import "../../src/styles.css";
// The real Reader on a controlled community service (UI-SPEC A4, E7): the build the test runs against has no
// community configured, so the Community row, its page and its offline words are shown here, on a fixture page
// that is served at a reader address. The answers of the controlled SDK are driven through window.readerFixture.
createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <PrivateProfileBoundary>
      <div className="shell">
        <main id="main" tabIndex={-1}>
          <Reader route={parseRoute(location.pathname, location.search)} />
        </main>
      </div>
    </PrivateProfileBoundary>
  </AuthProvider>,
);
