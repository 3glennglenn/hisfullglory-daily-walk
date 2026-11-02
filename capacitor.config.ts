import type { CapacitorConfig } from "@capacitor/cli";

// The one Capacitor configuration of the store apps (D-01, D-02). The app is the bundled web build in dist
// (npm run build:native writes it without a service worker); there is deliberately no `server` block, so the app
// never loads from app.hisfullglory.com or any other remote address and works offline from its own files.
//
// NEVER CHANGE after the first store release: appId (the bundle ID and package name are permanent in both stores),
// and the address the app is served from (capacitor://localhost on iOS, https://localhost on Android, the
// defaults). WebView storage, which holds the private journal, reading progress and the sign-in session, belongs to
// that origin; a different scheme, host or hostname would start every reader with an empty app.
const config: CapacitorConfig = {
  appId: "com.hisfullglory.app",
  appName: "HisFullGlory",
  webDir: "dist",
};

export default config;
