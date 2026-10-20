// The published context checks (approved, and AI-unreviewed ones with their label), built into the app
// from the website's content folder, so the app and the site always show the same text. Drafts never
// reach the app. Newest first.
import { publishedChecks } from "./checks";

const files = import.meta.glob("../../site/content/context-checks/*.json", { eager: true, import: "default" });
export const contextChecks = publishedChecks(Object.values(files));
