import { defineConfig } from "astro/config";

// Static output: every page is plain HTML that search engines can read.
export default defineConfig({
  site: "https://hisfullglory.com",
  // Addresses have no trailing slash, the same shape as the app's own links
  // (/bible/psalms/23). vercel.json serves the .html files at those addresses.
  trailingSlash: "never",
  build: { format: "file" },
  devToolbar: { enabled: false },
  // Shared data (WEB text, study notes, topic graph) is read from the app, one level up.
  vite: { server: { fs: { allow: [".."] } } },
});
