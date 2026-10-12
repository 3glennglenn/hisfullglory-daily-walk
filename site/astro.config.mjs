import { defineConfig } from "astro/config";

// Static output: every page is plain HTML that search engines can read.
export default defineConfig({
  site: "https://hisfullglory.com",
  devToolbar: { enabled: false },
  // Shared data (WEB text, study notes, topic graph) is read from the app, one level up.
  vite: { server: { fs: { allow: [".."] } } },
});
