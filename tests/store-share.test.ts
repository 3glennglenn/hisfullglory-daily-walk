// Sharing from the store app (2026-11-16 bug sweep): inside the iPhone app a download link does nothing and the app's own
// address is capacitor://localhost, so backups and pictures go through the share sheet and passage links use the web app.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shareFileNatively } from "../src/native/shareFile.ts";
import { config } from "../src/config.ts";

test("outside the store app the native share helper steps aside, so the web keeps its own behaviour", async () => {
  assert.equal(await shareFileNatively("x.json", "{}", "x"), "unavailable");
});

test("the store app shares passage links on the public web app, never on its own capacitor:// address", () => {
  assert.equal(config.appUrl, "https://app.hisfullglory.com");
  const sheet = readFileSync("src/bible/VerseSheet.tsx", "utf8");
  assert.match(sheet, /storeBuild \? config\.appUrl : window\.location\.origin\) \+ source/);
});

test("backup export and the story picture try the native share sheet before a download link", () => {
  const settings = readFileSync("src/features/Settings.tsx", "utf8");
  assert.ok(settings.indexOf("shareFileNatively(name") < settings.indexOf("a.download = name"), "Settings: share sheet first");
  const card = readFileSync("src/context/shareCard.ts", "utf8");
  assert.ok(card.indexOf("shareFileNatively(file.name") < card.indexOf("link.download = file.name"), "picture: share sheet first");
});
