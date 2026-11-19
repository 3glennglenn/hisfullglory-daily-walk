// scripts/asc-listing.mjs against a fake App Store Connect: the token, the choices it makes and the calls it sends.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { client, jwt, missingContact, pickBuild, pickVersion, readListing, sameScreenshots, submitForReview, syncScreenshots, withQuery } from "../scripts/asc-listing.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

test("the token is an ES256 JWT for App Store Connect that verifies with the key", () => {
  const token = jwt({ keyId: "KEY123", issuerId: "issuer-1", privateKey, now: 1_700_000_000_000 });
  const [head, body, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), { alg: "ES256", kid: "KEY123", typ: "JWT" });
  const claims = JSON.parse(Buffer.from(body, "base64url"));
  assert.equal(claims.aud, "appstoreconnect-v1");
  assert.equal(claims.iss, "issuer-1");
  assert.equal(claims.exp - claims.iat, 900, "15 minutes, under Apple's limit of 20");
  assert.ok(verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
});

test("filter brackets are encoded in the query", () => {
  assert.equal(withQuery("/v1/builds", { "filter[app]": "1" }), "/v1/builds?filter%5Bapp%5D=1");
});

test("the version: the named one, else the only editable one", () => {
  const v = (id, versionString, appVersionState) => ({ id, attributes: { versionString, appVersionState } });
  assert.equal(pickVersion([v("a", "1.0", "PREPARE_FOR_SUBMISSION")], "1.0").id, "a");
  assert.equal(pickVersion([v("a", "1.0.0", "PREPARE_FOR_SUBMISSION")], "1.0").id, "a");
  assert.equal(pickVersion([v("a", "0.9", "READY_FOR_SALE"), v("b", "1.1", "PREPARE_FOR_SUBMISSION"), v("c", "1.2", "PREPARE_FOR_SUBMISSION")], "1.0"), null);
});

test("the build: newest by number, or the asked one; processing and failed builds are reported", () => {
  const b = (id, version, processingState, expired = false) => ({ id, attributes: { version, processingState, expired } });
  const builds = [b("x3", "3", "VALID"), b("x4", "4", "PROCESSING"), b("x2", "2", "VALID", true)];
  assert.equal(pickBuild(builds).state, "processing");
  assert.equal(pickBuild(builds, 3).build.id, "x3");
  assert.equal(pickBuild(builds, 3).state, "ready");
  assert.equal(pickBuild(builds, 2).state, "missing", "expired builds are never used");
  assert.equal(pickBuild([b("x5", "5", "INVALID")]).state, "failed");
});

test("screenshots in place are recognised by name, checksum, order and state", () => {
  const wanted = [{ fileName: "a.png", checksum: "1" }, { fileName: "b.png", checksum: "2" }];
  const shot = (fileName, sourceFileChecksum, state = "COMPLETE") => ({ attributes: { fileName, sourceFileChecksum, assetDeliveryState: { state } } });
  assert.ok(sameScreenshots([shot("a.png", "1"), shot("b.png", "2")], wanted));
  assert.ok(!sameScreenshots([shot("b.png", "2"), shot("a.png", "1")], wanted), "order matters");
  assert.ok(!sameScreenshots([shot("a.png", "1"), shot("b.png", "2", "UPLOAD_COMPLETE")], wanted), "unprocessed is not done");
  assert.ok(!sameScreenshots([shot("a.png", "1")], wanted));
});

test("the review contact must be complete", () => {
  assert.deepEqual(missingContact({ attributes: { contactFirstName: "A", contactLastName: "B", contactPhone: " ", contactEmail: "e" } }), ["contactPhone"]);
  assert.equal(missingContact(null).length, 4);
});

test("listing.json names six iPhone 6.3-inch PNG screenshots (the one size App Store Connect requires since 2026) without transparency", () => {
  const listing = readListing();
  assert.equal(listing.screenshotDisplayType, "APP_IPHONE_61");
  assert.equal(listing.files.length, 6);
  for (const rel of listing.screenshots) assert.ok(existsSync(`store/ios/${rel}`), rel);
  for (const file of listing.files) {
    assert.equal(file.bytes.readUInt32BE(16), 1206, file.fileName);
    assert.equal(file.bytes.readUInt32BE(20), 2622, file.fileName);
    assert.equal(file.bytes[25], 2, `${file.fileName} is RGB without alpha`);
  }
});

/** A fake App Store Connect that keeps state and records every call. */
function fakeAsc({ versionState = "PREPARE_FOR_SUBMISSION", existingShots = [], builds = [], contact = true, submissions = [] } = {}) {
  const calls = [];
  const state = { shots: existingShots.slice(), attached: null, items: [], submissions: submissions.slice(), nextId: 1 };
  const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => (body === null ? "" : JSON.stringify(body)) });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const u = new URL(url);
    const path = u.pathname;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push(`${method} ${u.host === "api.appstoreconnect.apple.com" ? path : "upload"}`);
    if (u.host !== "api.appstoreconnect.apple.com") return { ok: true, status: 200 };
    assert.match(init.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    if (method === "GET" && path === "/v1/apps/app1/appStoreVersions")
      return json({ data: [{ id: "ver1", attributes: { versionString: "1.0", appVersionState: versionState } }] });
    if (method === "GET" && path === "/v1/appStoreVersions/ver1/appStoreVersionLocalizations") return json({ data: [{ id: "loc1", attributes: { locale: "en-US" } }] });
    if (method === "GET" && path === "/v1/appStoreVersionLocalizations/loc1/appScreenshotSets") return json({ data: [] });
    if (method === "POST" && path === "/v1/appScreenshotSets") return json({ data: { id: "set1", attributes: body.data.attributes } }, 201);
    if (method === "GET" && path === "/v1/appScreenshotSets/set1/appScreenshots") return json({ data: state.shots });
    if (method === "DELETE" && path.startsWith("/v1/appScreenshots/")) return json(null, 204);
    if (method === "POST" && path === "/v1/appScreenshots") {
      const id = `shot${state.nextId++}`;
      return json({ data: { id, attributes: { uploadOperations: [{ method: "PUT", url: `https://upload.example/${id}`, offset: 0, length: body.data.attributes.fileSize, requestHeaders: [] }] } } }, 201);
    }
    if (method === "PATCH" && path.startsWith("/v1/appScreenshots/")) return json({ data: { id: path.split("/").pop() } });
    if (method === "GET" && path.startsWith("/v1/appScreenshots/")) return json({ data: { attributes: { assetDeliveryState: { state: "COMPLETE" } } } });
    if (method === "PATCH" && path === "/v1/appScreenshotSets/set1/relationships/appScreenshots") return json(null, 204);
    if (method === "GET" && path === "/v1/builds") return json({ data: builds });
    if (method === "GET" && path === "/v1/appStoreVersions/ver1/build") return json({ data: state.attached ? { id: state.attached } : null });
    if (method === "PATCH" && path === "/v1/appStoreVersions/ver1/relationships/build") {
      state.attached = body.data.id;
      return json(null, 204);
    }
    if (method === "GET" && path === "/v1/appStoreVersions/ver1/appStoreReviewDetail")
      return json({ data: { attributes: contact ? { contactFirstName: "A", contactLastName: "B", contactPhone: "+31", contactEmail: "e@x" } : {} } });
    if (method === "GET" && path === "/v1/reviewSubmissions") return json({ data: state.submissions });
    if (method === "POST" && path === "/v1/reviewSubmissions") return json({ data: { id: "sub1", attributes: { state: "READY_FOR_REVIEW" } } }, 201);
    if (method === "GET" && path === "/v1/reviewSubmissions/sub1/items") return json({ data: state.items });
    if (method === "POST" && path === "/v1/reviewSubmissionItems") {
      state.items.push({ relationships: { appStoreVersion: { data: { id: body.data.relationships.appStoreVersion.data.id } } } });
      return json({ data: { id: "item1" } }, 201);
    }
    if (method === "PATCH" && path === "/v1/reviewSubmissions/sub1") {
      assert.equal(body.data.attributes.submitted, true);
      return json({ data: { id: "sub1" } });
    }
    return json({ errors: [{ title: "unexpected", detail: `${method} ${path}` }] }, 404);
  };
  return { api: client({ keyId: "K", issuerId: "I", privateKey, fetchImpl }), calls, state };
}

const listing = () => ({ ...readListing(), appId: "app1" });
const quiet = async (fn) => {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
};

test("screenshots: an empty set gets the six files, each committed, then put in order", async () => {
  const { api, calls } = fakeAsc();
  const result = await quiet(() => syncScreenshots(api, listing(), { sleep: async () => {} }));
  assert.equal(result, "uploaded");
  assert.equal(calls.filter((c) => c === "POST /v1/appScreenshots").length, 6);
  assert.equal(calls.filter((c) => c === "PUT upload").length, 6);
  assert.ok(calls.includes("POST /v1/appScreenshotSets"));
  assert.equal(calls.at(-1), "PATCH /v1/appScreenshotSets/set1/relationships/appScreenshots");
});

test("screenshots: a submitted version is left alone", async () => {
  const { api, calls } = fakeAsc({ versionState: "WAITING_FOR_REVIEW" });
  assert.equal(await quiet(() => syncScreenshots(api, listing())), "locked");
  assert.ok(!calls.some((c) => c.startsWith("POST") || c.startsWith("DELETE")));
});

test("submit: waits for the asked build, attaches it, creates a submission and submits", async () => {
  const b = (id, version, processingState) => ({ id, attributes: { version, processingState, expired: false } });
  const builds = [b("b3", "3", "VALID")];
  const { api, calls, state } = fakeAsc({ builds });
  let waits = 0;
  const sleep = async () => {
    waits++;
    builds.unshift(b("b4", "4", waits === 1 ? "PROCESSING" : "VALID"));
  };
  const result = await quiet(() => submitForReview(api, listing(), { build: 4, sleep }));
  assert.equal(result, "submitted");
  assert.equal(state.attached, "b4", "build 4, not the older valid build 3");
  assert.ok(waits >= 2);
  assert.deepEqual(calls.slice(-3), ["GET /v1/reviewSubmissions/sub1/items", "POST /v1/reviewSubmissionItems", "PATCH /v1/reviewSubmissions/sub1"]);
});

test("submit: refuses without a complete App Review contact, before creating anything", async () => {
  const { api, calls } = fakeAsc({ builds: [{ id: "b3", attributes: { version: "3", processingState: "VALID", expired: false } }], contact: false });
  await assert.rejects(quiet(() => submitForReview(api, listing())), /App Review information is missing contactFirstName/);
  assert.ok(!calls.includes("POST /v1/reviewSubmissions"));
});

test("submit: a version already in review is not submitted again", async () => {
  const { api, calls } = fakeAsc({ versionState: "WAITING_FOR_REVIEW" });
  assert.equal(await quiet(() => submitForReview(api, listing())), "already");
  assert.ok(!calls.some((c) => c.startsWith("POST") || c.startsWith("PATCH")));
});

test("the script never prints the key or the token", () => {
  const text = readFileSync("scripts/asc-listing.mjs", "utf8");
  assert.doesNotMatch(text, /console\.(log|error)\([^)]*(bearer|token|privateKey|ASC_KEY_PATH)\b/i);
});
