// What version 1.0 of the store app leaves out (src/native/storeScope.ts; founder, 2026-11-16).
import test from "node:test";
import assert from "node:assert/strict";
import { accountsInApp, pageInBuild, storeBuild, webRemindersInApp } from "../src/native/storeScope.ts";

test("outside Vite (Node) the module counts as the web build, which keeps everything", () => {
  assert.equal(storeBuild, false);
  assert.equal(accountsInApp, true);
  assert.equal(webRemindersInApp, true);
});

test("the web build has every page", () => {
  for (const page of ["home", "bible", "community", "circles", "profile", "give", "giving-policy", "settings", "pray"])
    assert.equal(pageInBuild(page, undefined, false), true, page);
  assert.equal(pageInBuild("settings", "reminders", false), true);
});

test("the store build of version 1.0 leaves out the community, the account, giving and web reminders", () => {
  for (const page of ["community", "circles", "profile", "give", "giving-policy"])
    assert.equal(pageInBuild(page, undefined, true), false, page);
  assert.equal(pageInBuild("settings", "reminders", true), false);
});

test("the store build keeps reading, studying, the walk, prayers, the journal, settings and the shop", () => {
  for (const page of ["home", "walk", "bible", "context", "shelf", "pray", "journal", "my-walk", "grow", "you", "shop"])
    assert.equal(pageInBuild(page, undefined, true), true, page);
  assert.equal(pageInBuild("settings", undefined, true), true);
  assert.equal(pageInBuild("settings", "appearance", true), true);
});
