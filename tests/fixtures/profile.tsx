// Controlled SDK fixture, never imported by the production application.
// Renders the real Profile page the way the app does: inside AuthProvider and PrivateProfileBoundary.
import {createRoot} from "react-dom/client";
import {AuthProvider} from "../../src/platform/auth";
import {PrivateProfileBoundary} from "../../src/platform/PrivateProfile";
import {Profile} from "../../src/features/Settings";
createRoot(document.getElementById("root")!).render(<AuthProvider><PrivateProfileBoundary><div className="shell"><main id="main"><Profile/></main></div></PrivateProfileBoundary></AuthProvider>);
