import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankState } from "../src/storage.ts";
import {
  migrateV1,
  loadPlatform,
  normalizePlatform,
  savePlatform,
  V1_KEY,
  V2_KEY,
  type StorageLike,
} from "../src/platform/persistence.ts";
import { parseRoute, resolveTheme } from "../src/platform/router.ts";
import {
  detectCapabilities,
  nativeGivingAllowed,
} from "../src/platform/capabilities.ts";
import { prayerTransition } from "../src/platform/models.ts";
import { safeMetadata } from "../src/analytics.ts";
import {
  searchBible,
  contextNotes,
  type BibleData,
} from "../src/bible/provider.ts";
import {
  approvedFundraiserUrl,
  hasPaymentDetails,
  supportExpiry,
  causes,
  curatedCharityCatalog,
  goFundMeProvider,
} from "../src/giving/catalog.ts";
class Memory implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}
test("empty or impossible support expiry cannot crash saving or normalize silently", () => {
  for (const value of [
    "",
    "invalid",
    "2026-02-30",
    "2026-13-01",
    "2026-10-07T00:00:00Z",
  ])
    assert.equal(supportExpiry(value), null);
  assert.equal(supportExpiry("2028-02-29"), "2028-02-29T23:59:59.000Z");
});
test("v1 migrates once without erasing journals, onboarding, all plan progress or source data", () => {
  const legacy = {
    ...blankState(),
    onboarded: true,
    goal: "peace-in-god",
    activePlan: "closer-to-god",
    installDismissed: true,
    journals: { "2026-10-05": "Honest words" },
    completedDates: ["2026-10-05"],
    progress: {
      "closer-to-god": [0, 1],
      "peace-in-god": [2],
      "consistent-in-the-word": [4],
    },
  };
  const store = new Memory();
  const raw = JSON.stringify(legacy);
  store.setItem(V1_KEY, raw);
  const first = loadPlatform(store);
  assert.deepEqual(first.state.local, legacy);
  assert.equal(first.state.entries[0].body, "Honest words");
  assert.equal(first.state.preferences.goals[0], "Peace");
  assert.equal(store.getItem(V1_KEY), raw);
  assert.deepEqual(loadPlatform(store).state, first.state);
});
test("corrupt/unknown v2 is retained and cannot be overwritten; v1 remains recoverable", () => {
  for (const raw of ["broken", '{"version":99}']) {
    const s = new Memory();
    s.setItem(V2_KEY, raw);
    s.setItem(V1_KEY, "legacy");
    const result = loadPlatform(s);
    assert.equal(result.blocked, true);
    assert.equal(savePlatform(s, result.state, result.blocked), false);
    assert.equal(s.getItem(V2_KEY), raw);
    assert.equal(s.getItem(V1_KEY), "legacy");
  }
  const noStorage = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.equal(loadPlatform(noStorage).blocked, true);
});
test("migration tolerates partial legacy and sanitizes unknown preferences without silently erasing valid entries", () => {
  const s = migrateV1({
    version: 1,
    journals: { "2026-10-01": "Saved" },
    progress: { "peace-in-god": [1] },
  });
  assert.equal(s.entries.length, 1);
  assert.deepEqual(s.local.progress["peace-in-god"], [1]);
  assert.equal(
    normalizePlatform({
      ...s,
      theme: "neon",
      preferences: {
        goals: ["Prayer", "Peace", "bad", "Consistency", "Purpose & direction"],
        minutes: 999,
      },
    })?.theme,
    "system",
  );
  assert.deepEqual(normalizePlatform(s)?.entries, s.entries);
});

test("quota-full migration and normalization keep readable private data", () => {
  for (const version of [1, 2]) {
    const store = new Memory();
    const legacy = {
      ...blankState(),
      onboarded: true,
      journals: { "2026-10-05": "Retain these words" },
    };
    const key = version === 1 ? V1_KEY : V2_KEY;
    const raw = JSON.stringify(
      version === 1 ? legacy : { ...migrateV1(legacy), theme: "invalid" },
    );
    store.setItem(key, raw);
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const result = loadPlatform(store);
    assert.equal(result.state.local.onboarded, true);
    assert.equal(result.state.entries[0]?.body, "Retain these words");
    assert.equal(result.blocked, true);
    assert.match(result.notice, /storage|saved/i);
    assert.equal(store.getItem(key), raw);
  }
});

test("normalization never replaces an earlier recovery snapshot", () => {
  const store = new Memory();
  const recovery = V2_KEY + ":recovery:normalized";
  store.setItem(recovery, "earlier recoverable private content");
  store.setItem(
    V2_KEY,
    JSON.stringify({ ...migrateV1(blankState()), theme: "invalid" }),
  );
  const result = loadPlatform(store);
  assert.equal(store.getItem(recovery), "earlier recoverable private content");
  assert.equal(result.blocked, true);
});

test("malformed prayer updates are recoverable instead of crashing normalization", () => {
  const store = new Memory();
  const state = migrateV1({
    ...blankState(),
    journals: { "2026-10-05": "Safe journal" },
  });
  store.setItem(
    V2_KEY,
    JSON.stringify({
      ...state,
      prayers: [
        {
          id: "p",
          title: "Prayer",
          body: "Private",
          answer: "",
          createdAt: "2026-10-05",
          status: "Active",
          updates: [null],
        },
      ],
    }),
  );
  const result = loadPlatform(store);
  assert.equal(result.state.entries[0]?.body, "Safe journal");
  assert.equal(result.state.prayers[0]?.body, "Private");
  assert.deepEqual(result.state.prayers[0]?.updates, []);
});

test("support stories reject alternate direct transfers and account numbers", () => {
  for (const value of [
    "Send to https://wise.com/pay/me",
    "Use www.revolut.me/example",
    "Account number 12345678901",
    "Card number 4111 1111 1111 1111",
    "Stuur naar rekeningnummer 123456789",
    "Send a wire transfer for help",
  ])
    assert.equal(hasPaymentDetails(value), true, value);
});
test("Bible bookmarks/highlights survive reload and unsupported context remains unavailable", () => {
  const memory = new Memory();
  const s = migrateV1(blankState());
  s.bookmarks = ["/bible/romans/8/28"];
  s.highlights = { "/bible/romans/8/28": "sage" };
  assert.equal(savePlatform(memory, s), true);
  assert.deepEqual(loadPlatform(memory).state.bookmarks, s.bookmarks);
  assert.deepEqual(loadPlatform(memory).state.highlights, s.highlights);
  assert.ok(contextNotes["romans/8"]);
  assert.equal(contextNotes["genesis/1"], undefined);
});
test("URL deep links parse, reject malformed paths, and preserve passage tabs", () => {
  assert.deepEqual(parseRoute("/bible/romans/8/28", "?tab=community"), {
    page: "bible",
    book: "romans",
    chapter: 8,
    verse: 28,
    tab: "community",
  });
  for (const path of [
    "/bible/romans/0",
    "/bible/romans/8/x",
    "/bible/romans/8/28/extra",
    "/unknown",
  ])
    assert.equal(parseRoute(path).page, "not-found");
  assert.equal(parseRoute("/grow/anxiety").id, "anxiety");
  assert.equal(parseRoute("/bible/romans/8", "?tab=anything").tab, "read");
});
test("You replaces More: /you parses, /settings takes only the sub-paths appearance and reminders, /more still parses", () => {
  assert.deepEqual(parseRoute("/you"), { page: "you", id: undefined, tab: "read" });
  assert.deepEqual(parseRoute("/settings/reminders"), { page: "settings", id: "reminders", tab: "read" });
  assert.equal(parseRoute("/settings/appearance").id, "appearance");
  assert.deepEqual(parseRoute("/settings"), { page: "settings", id: undefined, tab: "read" });
  for (const path of ["/settings/other", "/settings/reminders/x", "/settings/Reminders", "/settings/..", "/you/x"])
    assert.equal(parseRoute(path).page, "not-found", path);
  // The shell replaces "/more" with "/you" through history.replaceState; the router keeps parsing it.
  assert.equal(parseRoute("/more").page, "more");
});
test("theme follows live system changes and capabilities never enable unconfigured services", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  const flags = detectCapabilities(false);
  assert.equal(flags.community, false);
  assert.equal(flags.productionGivingPayments, false);
  assert.equal(flags.nativePush, false);
  assert.equal(flags.licensedBibleTranslations, false);
  const gates = {
    serverCredentials: true,
    verifiedWebhooks: true,
    verifiedRecipient: true,
    legalApproval: true,
    productionFlag: true,
  };
  assert.equal(nativeGivingAllowed(gates), true);
  for (const k of Object.keys(gates))
    assert.equal(nativeGivingAllowed({ ...gates, [k]: false }), false);
});
test("answering a prayer requires an answer and never publishes anything", () => {
  const prayer = {
    id: "p",
    title: "Hope",
    body: "Private request",
    status: "Active" as const,
    answer: "",
    updates: [],
    createdAt: "2026-10-07",
  };
  assert.throws(() => prayerTransition(prayer, "Answered", " "));
  const answered = prayerTransition(prayer, "Answered", "Help came");
  assert.equal(answered.answer, "Help came");
  assert.equal(prayer.status, "Active");
  assert.equal("published" in answered, false);
  assert.equal(prayerTransition(answered, "Archived").answer, "Help came");
});
test("analytics drops private text and identity and never records fundraiser paths", () => {
  assert.deepEqual(
    safeMetadata({
      email: "a@example.com",
      body: "Private prayer",
      journal: "Saved",
      user_id: "id",
      source: "/bible/romans/8",
      domain: "secure.givewell.org",
      date: "2026-10-07",
    }),
    { domain: "secure.givewell.org", date: "2026-10-07" },
  );
  assert.deepEqual(
    safeMetadata({
      domain: "evil.example",
      product: "x@example.com",
      room: "my private words",
    }),
    {},
  );
});
test("full WEB has canonical coverage, exact key verses, no leaked morphology and local search", () => {
  const bible = JSON.parse(
    readFileSync("public/bible/web.json", "utf8"),
  ) as BibleData;
  assert.equal(bible.books.length, 66);
  assert.equal(
    bible.books.reduce((n, b) => n + b.chapters.length, 0),
    1189,
  );
  const rom = bible.books.find((b) => b.slug === "romans")!;
  assert.equal(
    rom.chapters[7].verses.find((v) => v.number === 28)?.text,
    "We know that all things work together for good for those who love God, for those who are called according to his purpose.",
  );
  for (const book of bible.books)
    for (const chapter of book.chapters)
      for (const v of chapter.verses) {
        assert.ok(v.text || v.omitted);
        assert.ok(!/[\\]|strong=|morph=/.test(v.text));
      }
  assert.equal(
    searchBible(bible, "shepherd")[0].path.startsWith("/bible/"),
    true,
  );
  assert.deepEqual(searchBible(bible, "x"), []);
  assert.equal(searchBible(bible, "God").length, 60);
});
test("external fundraiser allowlist rejects host tricks, payment instructions and fabricated donation totals", () => {
  assert.equal(
    approvedFundraiserUrl("https://www.gofundme.com/f/help-a-family"),
    true,
  );
  for (const url of [
    "http://www.gofundme.com/f/help",
    "https://gofundme.com/f/help",
    "https://www.gofundme.com.evil.org/f/help",
    "https://evil@www.gofundme.com/f/help",
    "https://www.gofundme.com/f/help?redirect=evil",
    "https://www.gofundme.com:443/f/help",
    "https://www.gofundme.com/f/%68elp",
  ])
    assert.equal(approvedFundraiserUrl(url), false);
  for (const text of [
    "My IBAN is NL91 ABNA 0417 1643 00",
    "Send through PayPal",
    "bitcoin wallet address",
    "0x1234567890123456789012345678901234567890",
  ])
    assert.equal(hasPaymentDetails(text), true);
  assert.equal(hasPaymentDetails("Help with school supplies"), false);
  assert.equal(causes.length, 5);
  const copy = curatedCharityCatalog.get("top-charities")!;
  copy.title = "Changed outside provider";
  assert.equal(
    curatedCharityCatalog.get("top-charities")?.title,
    "GiveWell Top Charities Fund",
  );
  assert.equal(curatedCharityCatalog.list("Malaria prevention").length, 2);
  assert.equal(
    goFundMeProvider.accepts("https://www.gofundme.com/f/help-a-family"),
    true,
  );
  for (const cause of causes) {
    assert.equal(cause.donationUrl, "https://secure.givewell.org/");
    assert.equal("raised" in cause, false);
  }
});
