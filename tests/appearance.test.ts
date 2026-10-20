// Phase 01.1, plan 04: the forward step for lamplight, shelf and lastChapter, the one-time move of the old
// appearance key, and the rules of the Lamplight notice. Storage and matchMedia are mocked.
// Run from the project root: node --experimental-strip-types --test tests/appearance.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { blankState } from "../src/storage.ts";
import {
  V1_KEY,
  V2_KEY,
  V3_KEY,
  backupData,
  forgetAccount,
  freshPlatform,
  loadPlatform,
  migrateV1,
  normalizePlatform,
  savePlatform,
  scopedStorage,
  upgradeV3Fields,
} from "../src/platform/persistence.ts";
import {
  LAMPLIGHT_KEY,
  LOOK_KEY,
  NOTICE_KEY,
  escape,
  keep,
  migrateAppearance,
  readLamplight,
  readNotice,
  recordShown,
  shouldShowNotice,
  turnOff,
  watchDevice,
  writeLamplight,
  writeLook,
  writeNotice,
} from "../src/platform/appearance.ts";

class Memory {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
}

/** A v3 state as the app saved it before this plan: without the three new fields. */
function savedBefore(overrides: Record<string, unknown> = {}) {
  const { lamplight, shelf, lastChapter, ...old } = { ...freshPlatform(), ...overrides } as Record<string, unknown>;
  void lamplight, void shelf, void lastChapter;
  return old;
}

const recoveryKeys = (memory: Memory) => [...memory.data.keys()].filter((key) => key.includes(":recovery:"));

test("a v3 state saved before this change loads with no recovery notice and no recovery copy", () => {
  const memory = new Memory();
  const stored = JSON.stringify({
    ...savedBefore(),
    entries: [{ id: "e1", date: "2026-10-05", type: "free journal", title: "Kept", body: "Kept words" }],
  });
  memory.setItem(V3_KEY, stored);
  const loaded = loadPlatform(memory);
  assert.equal(loaded.blocked, false);
  assert.equal(loaded.notice, "");
  assert.deepEqual(recoveryKeys(memory), []);
  assert.equal(memory.getItem(V3_KEY), stored, "nothing was rewritten");
  assert.equal(loaded.state.entries[0].body, "Kept words");
  assert.equal(loaded.state.lamplight, "auto");
  assert.deepEqual(loaded.state.shelf, []);
  assert.equal(loaded.state.lastChapter, null);
});

test("the theme stays readable and lamplight comes from it: dark on, light off, system auto", () => {
  for (const [theme, lamplight] of [
    ["dark", "on"],
    ["light", "off"],
    ["system", "auto"],
  ] as const) {
    const memory = new Memory();
    memory.setItem(V3_KEY, JSON.stringify(savedBefore({ theme })));
    const loaded = loadPlatform(memory);
    assert.equal(loaded.notice, "", theme);
    assert.equal(loaded.state.theme, theme, "theme is unchanged");
    assert.equal(loaded.state.lamplight, lamplight, theme);
  }
});

test("loading the upgraded state twice gives identical JSON, and the step is idempotent", () => {
  const memory = new Memory();
  memory.setItem(V3_KEY, JSON.stringify(savedBefore({ theme: "dark" })));
  const first = JSON.stringify(loadPlatform(memory).state);
  assert.equal(JSON.stringify(loadPlatform(memory).state), first);
  const raw = JSON.parse(JSON.stringify(savedBefore({ theme: "light" })));
  const once = upgradeV3Fields(raw);
  assert.deepEqual(upgradeV3Fields(once), once);
  assert.equal(upgradeV3Fields(once), once, "an object that has the fields is returned as it is");
  // Saved after the upgrade, a state reloads without any recovery either.
  const saved = new Memory();
  savePlatform(saved, loadPlatform(memory).state);
  const again = loadPlatform(saved);
  assert.equal(again.notice, "");
  assert.deepEqual(recoveryKeys(saved), []);
  assert.equal(JSON.stringify(again.state), first);
});

test("the forward step appends the three fields in the order of freshPlatform and leaves the rest alone", () => {
  const raw = savedBefore({ theme: "dark" });
  const upgraded = upgradeV3Fields(raw) as Record<string, unknown>;
  const keys = Object.keys(upgraded);
  assert.deepEqual(keys, Object.keys(freshPlatform()));
  assert.deepEqual(keys.slice(-4), ["notifications", "lamplight", "shelf", "lastChapter"]);
  assert.equal(JSON.stringify(upgraded).startsWith(JSON.stringify(raw).slice(0, -1)), true);
  // A v2 object gets the same three fields without its version changing.
  const v2 = upgradeV3Fields({ ...(raw as object), version: 2 }) as Record<string, unknown>;
  assert.equal(v2.version, 2);
  assert.equal(v2.lamplight, "on");
  // Anything that is not a stored platform object passes through untouched.
  for (const other of [null, 7, "x", [], { version: 99 }]) assert.equal(upgradeV3Fields(other), other);
});

test("a state that already has the fields but needs a real repair still writes a recovery copy", () => {
  const memory = new Memory();
  const stored = JSON.stringify({ ...freshPlatform(), shelf: [{ slug: "../escape", finishedOn: "2026-10-05" }] });
  memory.setItem(V3_KEY, stored);
  const loaded = loadPlatform(memory);
  assert.deepEqual(loaded.state.shelf, []);
  assert.match(loaded.notice, /needed recovery/);
  assert.equal(memory.getItem(V3_KEY + ":recovery:normalized"), stored);
});

test("the shelf keeps valid slugs with a valid date, in stored order and once per slug; the rest is dropped", () => {
  const shelf = [
    { slug: "john-3-16", finishedOn: "2026-10-05" },
    { slug: "psalm-23", finishedOn: "2026-10-06" },
    { slug: "john-3-16", finishedOn: "2026-10-07" },
    { slug: "UPPER", finishedOn: "2026-10-08" },
    { slug: "has space", finishedOn: "2026-10-08" },
    { slug: "../etc", finishedOn: "2026-10-08" },
    { slug: "", finishedOn: "2026-10-08" },
    { slug: "romans-8", finishedOn: "2026-02-30" },
    { slug: "romans-9", finishedOn: "yesterday" },
    { slug: "romans-10", finishedOn: 20261008 },
    { slug: 42, finishedOn: "2026-10-08" },
    null,
    "john-1-1",
    { slug: "mark-1", finishedOn: "2026-10-09", extra: "x" },
  ];
  const state = normalizePlatform({ ...freshPlatform(), shelf });
  assert.deepEqual(state?.shelf, [
    { slug: "john-3-16", finishedOn: "2026-10-05" },
    { slug: "psalm-23", finishedOn: "2026-10-06" },
    { slug: "mark-1", finishedOn: "2026-10-09" },
  ]);
  assert.deepEqual(normalizePlatform({ ...freshPlatform(), shelf: "nope" })?.shelf, []);
  // The same rules apply to a state that is missing the field.
  const partial = JSON.parse(JSON.stringify(savedBefore()));
  const upgraded = upgradeV3Fields({ ...partial, lastChapter: null, shelf }) as { shelf: unknown };
  assert.deepEqual(upgraded.shelf, state?.shelf);
});

test("lastChapter keeps a /bible/{book}/{chapter} string and is null otherwise", () => {
  for (const good of ["/bible/john/3", "/bible/1-corinthians/13", "/bible/psalms/119"])
    assert.equal(normalizePlatform({ ...freshPlatform(), lastChapter: good })?.lastChapter, good);
  for (const bad of [
    "/bible/john/3/16",
    "/bible/john",
    "/bible/john/0",
    "/bible/John/3",
    "/bible/john/3?x=1",
    "/community/grief",
    "bible/john/3",
    "https://example.org/bible/john/3",
    "",
    3,
    {},
    undefined,
  ])
    assert.equal(normalizePlatform({ ...freshPlatform(), lastChapter: bad })?.lastChapter, null, String(bad));
});

test("v1 and v2 migrations produce the three fields with defaults", () => {
  const fromV1 = migrateV1(blankState());
  assert.equal(fromV1.lamplight, "auto");
  assert.deepEqual(fromV1.shelf, []);
  assert.equal(fromV1.lastChapter, null);
  for (const [key, raw] of [
    [V1_KEY, JSON.stringify(blankState())],
    [V2_KEY, JSON.stringify({ ...savedBefore({ theme: "dark" }), version: 2 })],
  ] as const) {
    const memory = new Memory();
    memory.setItem(key, raw);
    const loaded = loadPlatform(memory);
    assert.equal(loaded.state.version, 3);
    assert.equal(loaded.state.lamplight, key === V2_KEY ? "on" : "auto");
    assert.deepEqual(loaded.state.shelf, []);
    assert.equal(loaded.state.lastChapter, null);
  }
});

test("the shelf is in the backup export, goes with the account's keys, and guest and account shelves stay apart", () => {
  const memory = new Memory();
  const guest = scopedStorage(memory, null);
  const account = scopedStorage(memory, "user-a");
  const other = scopedStorage(memory, "user-b");
  const guestState = loadPlatform(guest).state;
  guestState.shelf = [{ slug: "guest-story", finishedOn: "2026-10-05" }];
  savePlatform(guest, guestState);
  const accountState = loadPlatform(account).state;
  assert.deepEqual(accountState.shelf, [], "login never adopts the guest shelf");
  accountState.shelf = [{ slug: "account-story", finishedOn: "2026-10-06" }];
  accountState.lastChapter = "/bible/john/3";
  savePlatform(account, accountState);
  assert.deepEqual(loadPlatform(guest).state.shelf, [{ slug: "guest-story", finishedOn: "2026-10-05" }]);
  assert.deepEqual(loadPlatform(account).state.shelf, [{ slug: "account-story", finishedOn: "2026-10-06" }]);
  assert.deepEqual(loadPlatform(other).state.shelf, []);
  assert.ok(backupData(account).includes("account-story"));
  assert.ok(!backupData(account).includes("guest-story"));
  assert.ok(!backupData(other).includes("account-story"));
  assert.ok(backupData(account).includes("/bible/john/3"));
  // Deleting the account removes its shelf with its other keys; the guest shelf stays.
  assert.ok(forgetAccount(memory, "user-a") >= 1);
  assert.ok(![...memory.data.values()].some((value) => value.includes("account-story")));
  assert.deepEqual(loadPlatform(guest).state.shelf, [{ slug: "guest-story", finishedOn: "2026-10-05" }]);
});

// ---- migrateAppearance ----------------------------------------------------------------------------------

test("migrateAppearance: hfg-appearance dark becomes hfg-lamplight on and the old key is removed", () => {
  for (const [old, expected] of [
    ["dark", "on"],
    ["light", "off"],
    ["system", "auto"],
  ] as const) {
    const memory = new Memory();
    memory.setItem("hfg-appearance", old);
    migrateAppearance(memory, "auto");
    assert.equal(memory.getItem(LAMPLIGHT_KEY), expected, old);
    assert.equal(memory.getItem("hfg-appearance"), null, old + ": removed");
  }
});

test("migrateAppearance: with neither key, the state's lamplight is written", () => {
  for (const lamplight of ["auto", "on", "off"] as const) {
    const memory = new Memory();
    migrateAppearance(memory, lamplight);
    assert.equal(memory.getItem(LAMPLIGHT_KEY), lamplight);
  }
});

test("migrateAppearance never overwrites an existing hfg-lamplight, and still clears the old key", () => {
  const memory = new Memory();
  memory.setItem(LAMPLIGHT_KEY, "off");
  memory.setItem("hfg-appearance", "dark");
  migrateAppearance(memory, "on");
  assert.equal(memory.getItem(LAMPLIGHT_KEY), "off");
  assert.equal(memory.getItem("hfg-appearance"), null);
  // Run again: the same result, nothing changes.
  migrateAppearance(memory, "on");
  assert.equal(memory.getItem(LAMPLIGHT_KEY), "off");
});

test("migrateAppearance with a storage that throws changes nothing and throws nothing", () => {
  const writes: string[] = [];
  const unreadable = {
    getItem() {
      throw new Error("blocked");
    },
    setItem(key: string) {
      writes.push(key);
    },
    removeItem(key: string) {
      writes.push(key);
    },
  };
  assert.doesNotThrow(() => migrateAppearance(unreadable, "on"));
  const unwritable = new Memory();
  unwritable.setItem("hfg-appearance", "dark");
  unwritable.setItem = () => {
    throw new Error("full");
  };
  assert.doesNotThrow(() => migrateAppearance(unwritable, "on"));
  assert.equal(unwritable.getItem("hfg-appearance"), "dark", "the old key stays until the new one is written");
  assert.deepEqual(writes, []);
});

test("after the move readLamplight reads the new key and the old value no longer matters", () => {
  const memory = new Memory();
  memory.setItem("hfg-appearance", "dark");
  assert.equal(readLamplight(memory), "on", "before the move the old value is still honoured");
  migrateAppearance(memory, "auto");
  memory.setItem("hfg-appearance", "light");
  assert.equal(readLamplight(memory), "on");
});

// ---- where the choice lives --------------------------------------------------------------------------------

test("look and Lamplight stay outside private state: not in the backup export, not account-scoped, not in analytics", () => {
  const memory = new Memory();
  writeLook("marked", memory);
  writeLamplight("on", memory);
  assert.equal(memory.getItem(LOOK_KEY), "marked");
  assert.equal(memory.getItem(LAMPLIGHT_KEY), "on");
  const state = freshPlatform();
  savePlatform(scopedStorage(memory, "user-a"), state);
  const backup = backupData(scopedStorage(memory, "user-a"));
  assert.ok(!backup.includes("hfg-look") && !backup.includes("hfg-lamplight"));
  assert.ok(![...memory.data.keys()].some((key) => key.startsWith("hfg-private:") && /look|lamplight/.test(key)));
  // A write that fails reports it and throws nothing: the choice lasts for the visit only.
  const full = new Memory();
  full.setItem = () => {
    throw new Error("full");
  };
  assert.equal(writeLook("cover", full), false);
  assert.equal(writeLamplight("off", full), false);
  // The provider and the notice never write to an account, a server, a cookie or analytics.
  for (const file of ["src/platform/AppearanceProvider.tsx", "src/ui/LamplightNotice.tsx", "src/platform/appearance.ts"]) {
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Comments may name what the code does not do.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /document\.cookie|analytics|supabase|fetch\(|sendBeacon|\bupdate\(/, file);
  }
});

// ---- the Lamplight notice (UI-SPEC 4) -----------------------------------------------------------------------

/** A matchMedia stand-in whose change listeners the test fires. */
function fakeDevice(dark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = {
    matches: dark,
    addEventListener(_type: "change", listener: (event: { matches: boolean }) => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "change", listener: (event: { matches: boolean }) => void) {
      listeners.delete(listener);
    },
  };
  return {
    media,
    listeners,
    switchTo(next: boolean) {
      media.matches = next;
      for (const listener of [...listeners]) listener({ matches: next });
    },
  };
}

test("the notice is due only for Automatic on a dark device with no answer yet and fewer than three showings", () => {
  const fresh = { shown: 0, done: false };
  assert.equal(shouldShowNotice("auto", true, fresh), true);
  assert.equal(shouldShowNotice("auto", false, fresh), false, "a light device");
  assert.equal(shouldShowNotice("on", true, fresh), false, "the reader chose On");
  assert.equal(shouldShowNotice("off", true, fresh), false, "the reader chose Off");
  assert.equal(shouldShowNotice("auto", true, { shown: 1, done: true }), false, "already answered");
  assert.equal(shouldShowNotice("auto", true, { shown: 2, done: false }), true, "one more showing is allowed");
  assert.equal(shouldShowNotice("auto", true, { shown: 3, done: false }), false, "three showings are enough");
});

test("each showing counts once; Keep and Turn off answer; Escape leaves the notice open to a later showing", () => {
  const fresh = { shown: 0, done: false };
  const once = recordShown(fresh);
  assert.deepEqual(once, { shown: 1, done: false });
  assert.deepEqual(fresh, { shown: 0, done: false }, "the input is not changed");
  assert.deepEqual(keep(once), { shown: 1, done: true });
  assert.equal(shouldShowNotice("auto", true, keep(once)), false);
  const off = turnOff(once);
  assert.deepEqual(off.notice, { shown: 1, done: true });
  assert.equal(off.lamplight, "off");
  const escaped = escape(once);
  assert.deepEqual(escaped, { shown: 1, done: false });
  assert.equal(shouldShowNotice("auto", true, escaped), true, "it may show again at the next automatic switch");
  // Three showings, answered or not, are the most there are.
  let notice = fresh;
  let showings = 0;
  while (shouldShowNotice("auto", true, notice)) {
    notice = escape(recordShown(notice));
    showings++;
  }
  assert.equal(showings, 3);
});

test("a device change from light to dark makes the notice due with Automatic, never with On or Off", () => {
  for (const [lamplight, due] of [
    ["auto", true],
    ["on", false],
    ["off", false],
  ] as const) {
    const device = fakeDevice(false);
    let dark = device.media.matches;
    const stop = watchDevice(device.media, (next) => {
      dark = next;
    });
    assert.equal(shouldShowNotice(lamplight, dark, readNotice(new Memory())), false, lamplight + ": light device");
    device.switchTo(true);
    assert.equal(shouldShowNotice(lamplight, dark, readNotice(new Memory())), due, lamplight + ": device turned dark");
    device.switchTo(false);
    assert.equal(shouldShowNotice(lamplight, dark, readNotice(new Memory())), false, lamplight + ": device turned light");
    stop();
    assert.equal(device.listeners.size, 0, "the listener is removed");
  }
});

test("an unreadable or out-of-range hfg-lamplight-notice value reads as the default", () => {
  const fresh = { shown: 0, done: false };
  for (const raw of [
    "not json",
    "null",
    "7",
    '"x"',
    "[]",
    "{}",
    '{"shown":"2","done":false}',
    '{"shown":-1,"done":false}',
    '{"shown":1.5,"done":false}',
    '{"shown":99,"done":false}',
    '{"shown":1,"done":"yes"}',
    '{"shown":1}',
  ]) {
    const memory = new Memory();
    memory.setItem(NOTICE_KEY, raw);
    assert.deepEqual(readNotice(memory), fresh, raw);
  }
  assert.deepEqual(readNotice(new Memory()), fresh, "absent");
  const unreadable = {
    getItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readNotice(unreadable), fresh, "storage that throws");
  const memory = new Memory();
  memory.setItem(NOTICE_KEY, '{"shown":2,"done":true}');
  assert.deepEqual(readNotice(memory), { shown: 2, done: true });
});

test("the notice counters are stored as {shown, done} under hfg-lamplight-notice and survive a failed write", () => {
  const memory = new Memory();
  assert.equal(writeNotice({ shown: 1, done: false }, memory), true);
  assert.equal(memory.getItem(NOTICE_KEY), '{"shown":1,"done":false}');
  assert.deepEqual(readNotice(memory), { shown: 1, done: false });
  const full = new Memory();
  full.setItem = () => {
    throw new Error("full");
  };
  assert.equal(writeNotice({ shown: 1, done: false }, full), false);
  // The notice state is not private state and not in the export.
  assert.ok(!backupData(memory).includes("hfg-lamplight-notice"));
});
