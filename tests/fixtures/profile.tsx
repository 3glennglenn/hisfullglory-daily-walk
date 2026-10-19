// Controlled SDK fixture, never imported by the production application.
// Renders the real Profile page the way the app does: inside AuthProvider and PrivateProfileBoundary.
// With #settings in the address it renders the real Settings page instead.
import {createRoot} from "react-dom/client";
import {AuthProvider} from "../../src/platform/auth";
import {PrivateProfileBoundary} from "../../src/platform/PrivateProfile";
import {Profile,Settings} from "../../src/features/Settings";
const Page=location.hash==="#settings"?Settings:Profile;
createRoot(document.getElementById("root")!).render(<AuthProvider><PrivateProfileBoundary><div className="shell"><main id="main"><Page/></main></div></PrivateProfileBoundary></AuthProvider>);
