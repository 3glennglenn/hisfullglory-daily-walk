// Ties every outside address in the code to the privacy policy (GATE-02, threat T-01-21).
//
// The app and the website may only name an http(s) host that is listed in `outboundHosts` in
// site/src/data/legal.ts, the list the privacy page's processor cards are written from. A new
// host therefore fails here until someone has decided what it receives and told the reader.
// The other way round also fails: a host the code no longer uses must leave the list, so the
// policy never names a company we stopped using. Hosts reached through configuration (the
// Supabase project in VITE_SUPABASE_URL, the push services in the allow-list of
// supabase/migrations/010_push.sql, the mail relay set in the Supabase dashboard) are marked
// `viaConfiguration` and are not expected as literals.
//
// Run from the project root: node --experimental-strip-types --test tests/third-parties.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { outboundHosts, processors } from "../site/src/data/legal.ts";

/** Loopback addresses are this computer, not a company: development servers and tests use them. */
const loopback = new Set(["localhost", "127.0.0.1"]);

/** The hosts written as http(s) literals in a piece of text, lower case, with the lines they sit on. */
function hostsIn(text: string): Map<string, number[]> {
  const found = new Map<string, number[]>();
  text.split(/\r?\n/).forEach((line, index) => {
    // A host starts with a letter or digit, so `https://${project}.supabase.co` is not a literal.
    for (const match of line.matchAll(/https?:\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)/g)) {
      const host = match[1].toLowerCase();
      if (loopback.has(host)) continue;
      found.set(host, [...(found.get(host) ?? []), index + 1]);
    }
  });
  return found;
}

function filesUnder(dir: string, wanted: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : filesUnder(path, wanted);
    return wanted.test(entry.name) ? [path] : [];
  });
}

/** The source the app and the website ship: the folders the privacy policy has to account for. */
function sourceFiles(): string[] {
  return [
    ...filesUnder("src", /\.tsx?$/),
    ...filesUnder("site/src", /\.(ts|astro|mjs)$/),
    ...["index.html", "vite.config.ts"].filter((file) => existsSync(file)),
    // Only the files directly in public/ (the service worker), not the Bible and study data below it.
    ...(existsSync("public") ? readdirSync("public").filter((name) => /\.js$/.test(name)).map((name) => join("public", name)) : []),
  ];
}

function scan(): Map<string, string[]> {
  const where = new Map<string, string[]>();
  for (const file of sourceFiles())
    for (const [host, lines] of hostsIn(readFileSync(file, "utf8")))
      where.set(host, [...(where.get(host) ?? []), ...lines.map((line) => `${file.replaceAll("\\", "/")}:${line}`)]);
  return where;
}

test("the scan reads http(s) host literals and nothing that merely looks like one", () => {
  const sample = [
    'const a = "https://Cdn.Example.com/x.png?v=1";',
    "const b = `http://plain.example.org`;",
    "const c = `https://${project}.supabase.co`;",
    'fetch("/bible/web.json"); // no host here',
    'const d = "http://localhost:4321/"; const e = "http://127.0.0.1:5173";',
    'const f = "https://a.example.net/path", g = "https://b.example.net.";',
  ].join("\n");
  assert.deepEqual([...hostsIn(sample).keys()].sort(), ["a.example.net", "b.example.net", "cdn.example.com", "plain.example.org"]);
});

test("the scan reaches the app, the website, the page shell and the service worker", () => {
  const files = sourceFiles().map((file) => file.replaceAll("\\", "/"));
  for (const [label, wanted] of [
    ["app source", /^src\/.+\.tsx?$/],
    ["website source", /^site\/src\/.+\.(ts|astro)$/],
    ["index.html", /^index\.html$/],
    ["vite.config.ts", /^vite\.config\.ts$/],
    ["service worker", /^public\/[^/]+\.js$/],
  ] as const)
    assert.ok(files.some((file) => wanted.test(file)), `the scan found no ${label}`);
});

test("every http(s) host in the code is in outboundHosts, so the privacy policy can account for it", () => {
  const listed = new Set(outboundHosts.map((entry) => entry.host));
  const unlisted = [...scan()].filter(([host]) => !listed.has(host)).map(([host, where]) => `${host} (${where[0]})`);
  assert.deepEqual(
    unlisted,
    [],
    "A new outside address needs an entry in outboundHosts (site/src/data/legal.ts) and, if it receives data, a line in the privacy policy and docs/PRIVACY_DATA_FLOW.md.",
  );
});

test("every host in outboundHosts is still used by the code, unless it is reached through configuration", () => {
  const used = scan();
  const gone = outboundHosts.filter((entry) => !entry.viaConfiguration && !used.has(entry.host)).map((entry) => entry.host);
  assert.deepEqual(gone, [], "Remove a host the code no longer uses, so the policy does not name a company we stopped using.");
  // And the other way: a host the code does use must not be marked as configuration-only.
  const mislabelled = outboundHosts.filter((entry) => entry.viaConfiguration && used.has(entry.host)).map((entry) => entry.host);
  assert.deepEqual(mislabelled, [], "A host that appears as a literal is not reached through configuration only.");
});

test("each entry of outboundHosts is a plain host with a purpose and a known kind, listed once", () => {
  const kinds = ["processor", "loaded by the page", "link you click", "no request"];
  const seen = new Set<string>();
  for (const entry of outboundHosts) {
    assert.match(entry.host, /^(\*\.)?[a-z0-9][a-z0-9.-]*[a-z0-9]$/, `${entry.host}: a host in lower case, without scheme or path`);
    assert.ok(!seen.has(entry.host), `${entry.host} is listed twice`);
    seen.add(entry.host);
    assert.ok(entry.purpose.trim().length > 0, `${entry.host}: a purpose`);
    assert.ok(kinds.includes(entry.kind), `${entry.host}: kind "${entry.kind}"`);
    if (entry.viaConfiguration) assert.equal(entry.kind, "processor", `${entry.host}: only a processor is reached through configuration`);
  }
  // The scan never sees a wildcard, so a wildcard entry is configuration by nature.
  for (const entry of outboundHosts.filter((item) => item.host.startsWith("*.")))
    assert.ok(entry.viaConfiguration, `${entry.host}: a wildcard host is reached through configuration`);
});

test("a host that receives data is tied to a processor card, and every card has a host", () => {
  const cards = new Set(processors.map((card) => card.id));
  for (const entry of outboundHosts.filter((item) => item.kind === "processor" || item.kind === "loaded by the page")) {
    assert.ok(entry.processor, `${entry.host}: names the processor card it belongs to`);
    assert.ok(cards.has(entry.processor), `${entry.host}: processor "${entry.processor}" has no card in legal.ts`);
  }
  for (const card of processors)
    assert.ok(
      outboundHosts.some((entry) => entry.processor === card.id),
      `the ${card.name} card has no host in outboundHosts`,
    );
});

test("today's outside addresses are all accounted for", () => {
  assert.deepEqual(
    outboundHosts
      .filter((entry) => !entry.viaConfiguration)
      .map((entry) => entry.host)
      .sort(),
    [
      "app.hisfullglory.com",
      "cdn.shopify.com",
      "ebible.org",
      "hisfullglory.com",
      "secure.givewell.org",
      "shop.hisfullglory.com",
      "twitter.com",
      "wa.me",
      "www.facebook.com",
      "www.givewell.org",
      "www.gofundme.com",
      "www.sitemaps.org",
    ],
  );
});
