// The approved context checks, built into the app from the website's content folder, so the
// app and the site always show the same text. Drafts never reach the app.
import { approvedChecks } from "./checks";

const files = import.meta.glob("../../site/content/context-checks/*.json", { eager: true, import: "default" });
export const contextChecks = approvedChecks(Object.values(files));
