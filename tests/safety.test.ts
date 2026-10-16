import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reportReasons,
  kindNoun,
  reportErrorMessage,
  reportFailure,
  chooseReasonMessage,
  signInToReportBody,
  reportLimitMessage,
  sendFailedMessage,
} from "../src/social/reportReasons.ts";

// The category list the server accepts: the latest CHECK on community_reports.category.
function serverCategories(): string[] {
  const sql = readFileSync("supabase/migrations/006_circles.sql", "utf8");
  const match = sql.match(/community_reports_category_check check\(category in\(([^)]*)\)\)/);
  assert.ok(match, "006 must define community_reports_category_check");
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test("eight reasons, harm first, with the values the server already stores", () => {
  assert.deepEqual(
    reportReasons.map((r) => r.value),
    [
      "harassment",
      "hate",
      "sexual content",
      "dangerous advice",
      "scam",
      "private information",
      "spam",
      "other",
    ],
  );
  assert.deepEqual(
    reportReasons.map((r) => r.label),
    [
      "Harassment or threats",
      "Hate",
      "Sexual content",
      "Dangerous advice",
      "Scam",
      "Private information",
      "Spam",
      "Something else",
    ],
  );
});

test("every reason value is accepted by the 006 category check list", () => {
  const accepted = serverCategories();
  assert.ok(accepted.length >= 8);
  for (const reason of reportReasons) assert.ok(accepted.includes(reason.value), reason.value);
});

test("no label or hint contains an exclamation mark, and every row has a hint", () => {
  for (const reason of reportReasons) {
    assert.ok(reason.hint.length > 0, reason.value);
    assert.ok(!reason.label.includes("!"), reason.label);
    assert.ok(!reason.hint.includes("!"), reason.hint);
  }
  for (const text of [chooseReasonMessage, signInToReportBody, reportLimitMessage, sendFailedMessage])
    assert.ok(!text.includes("!"), text);
});

test("kindNoun names what the reader is looking at and falls back to post", () => {
  assert.equal(kindNoun("post"), "post");
  assert.equal(kindNoun("chat"), "chat message");
  assert.equal(kindNoun("prayer"), "prayer request");
  assert.equal(kindNoun("support"), "support request");
  assert.equal(kindNoun("walk_reflection"), "post");
  assert.equal(kindNoun(""), "post");
});

test("reportErrorMessage maps the four failures to calm sentences", () => {
  assert.equal(
    reportErrorMessage({ message: "Visible target required" }),
    "This post is no longer available, so it cannot be reported.",
  );
  assert.equal(
    reportErrorMessage(new Error("Visible target required"), "chat message"),
    "This chat message is no longer available, so it cannot be reported.",
  );
  assert.equal(
    reportErrorMessage({ message: "Authentication required" }),
    "Sign in to report. Reports are linked to an account so we can follow up and stop misuse. Open Profile to sign in.",
  );
  assert.equal(
    reportErrorMessage({ message: "Report limit reached" }),
    "You have sent a lot of reports in the last hour. Please try again later.",
  );
  assert.equal(
    reportErrorMessage({ message: "fetch failed" }),
    "Your report was not sent. Check your connection and try again.",
  );
});

test("reportErrorMessage never passes the server's wording or a developer word through", () => {
  for (const error of [null, undefined, 42, "", { message: 7 }, new Error("relation \"community_reports\" does not exist")]) {
    const text = reportErrorMessage(error);
    assert.equal(text, "Your report was not sent. Check your connection and try again.");
    assert.ok(!/migration|rpc|relation|platform/i.test(text));
  }
  assert.equal(reportFailure("Visible target required"), "gone");
});
