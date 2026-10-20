import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { assertReleasable } from "./site/src/data/legal.ts";

// A production build of the app is refused while the legal text is unapproved, so the app never
// links to pages that are not published and never shows placeholder text. Preview and local builds
// are unaffected. The project has no Node types, hence the narrow cast instead of `process`.
assertReleasable((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VERCEL_ENV);

export default defineConfig({
  // The app imports a few files from site/src (legal.ts, editorial.ts, sponsor.ts). Vite would look up the
  // closest tsconfig.json for each of them, and site/tsconfig.json extends astro/tsconfigs/strict, which exists
  // only where the site's own packages are installed. The app is built from the root install alone (Vercel, the
  // App job on GitHub), so that lookup fails there. A tsconfigRaw string skips the lookup; these are the
  // compiler options of the root tsconfig.json that change how esbuild writes the files.
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "ES2022", jsx: "react-jsx" } }) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "HisFullGlory Daily Walk",
        short_name: "Daily Walk",
        description: "A daily rhythm of Scripture, reflection, and prayer.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#F3F1EE",
        background_color: "#F3F1EE",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        // AI explanations are optional and load on demand, so they stay out of the install.
        globIgnores: ["ai/**"],
        maximumFileSizeToCacheInBytes: 8000000,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/auth\//],
        runtimeCaching: [],
        // Shows push notifications (supabase/functions/push-sender).
        importScripts: ["push-sw.js"],
      },
    }),
  ],
});
