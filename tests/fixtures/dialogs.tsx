import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../../src/platform/auth";
import { Feed } from "../../src/social/Feed";
import { Give } from "../../src/giving/Give";
import "../../src/styles.css";
// The screens whose questions go to the network (UI-SPEC A15): the public feed and Give. The test page
// switches between them by an event; the answers of the controlled SDK are driven through window.dialogFixture.
function Harness() {
  const [screen, setScreen] = useState<"feed" | "give">("feed");
  useEffect(() => {
    const change = (event: Event) => setScreen((event as CustomEvent<"feed" | "give">).detail);
    window.addEventListener("fixture-screen", change);
    return () => window.removeEventListener("fixture-screen", change);
  }, []);
  return (
    <AuthProvider>
      <div className="shell">
        <main id="main" tabIndex={-1}>
          {screen === "feed" ? <Feed composer={false} /> : <Give />}
        </main>
      </div>
    </AuthProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
