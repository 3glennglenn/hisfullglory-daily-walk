// App Store Connect from the repository, so a store release needs no clicking (autopilot queue item 3).
//
//   node scripts/asc-listing.mjs --status                 read only: version state, screenshots, builds, review
//   node scripts/asc-listing.mjs --screenshots            upload the iPhone screenshots of store/ios/listing.json
//   node scripts/asc-listing.mjs --submit [--build 4]     attach the newest processed build (or build 4, waiting
//                                                         until Apple has processed it) and submit for App Review
//   node scripts/asc-listing.mjs --listing                what listing.json asks: the screenshots, and the
//                                                         submission when "submit" is true (of "build" if named)
//
// Runs in the "App Store listing" workflow (.github/workflows/store-listing.yml) with the App Store Connect API key
// of the store-release environment. The key arrives as a file path and two ids in env and is never printed. Every
// step first reads what is there, so a second run changes nothing that is already right. Uses only Apple's public
// App Store Connect API (https://developer.apple.com/documentation/appstoreconnectapi).
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const API = "https://api.appstoreconnect.apple.com";
const LISTING = "store/ios/listing.json";

/** States in which Apple lets the version be changed and submitted. */
const EDITABLE = new Set(["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"]);
/** States of a version that is with App Review or past it. */
const SUBMITTED = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "READY_FOR_REVIEW", "PENDING_DEVELOPER_RELEASE", "PENDING_APPLE_RELEASE", "PROCESSING_FOR_DISTRIBUTION", "READY_FOR_SALE", "READY_FOR_DISTRIBUTION", "ACCEPTED"]);

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line) => console.log(line);

/** An App Store Connect API token (ES256), valid for 15 minutes. */
export function jwt({ keyId, issuerId, privateKey, now = Date.now() }) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const unsigned = `${part({ alg: "ES256", kid: keyId, typ: "JWT" })}.${part({ iss: issuerId, iat, exp: iat + 15 * 60, aud: "appstoreconnect-v1" })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** A small JSON:API client. `fetchImpl` is replaceable for the tests. */
export function client({ keyId, issuerId, privateKey, fetchImpl = fetch }) {
  let token = "";
  let madeAt = 0;
  const bearer = () => {
    if (!token || Date.now() - madeAt > 10 * 60 * 1000) {
      token = jwt({ keyId, issuerId, privateKey });
      madeAt = Date.now();
    }
    return token;
  };
  async function call(method, path, body) {
    const res = await fetchImpl(API + path, {
      method,
      headers: { Authorization: `Bearer ${bearer()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = res.status === 204 ? "" : await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const detail = json?.errors?.map((e) => [e.code, e.title, e.detail].filter(Boolean).join(": ")).join("; ") || text.slice(0, 300);
      throw new Error(`${method} ${path.split("?")[0]} failed with ${res.status}: ${detail}`);
    }
    return json;
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    patch: (path, body) => call("PATCH", path, body),
    del: (path) => call("DELETE", path),
    upload: (url, init) => fetchImpl(url, init),
  };
}

/** A path with a query string; the brackets of filter[...] are encoded. */
export function withQuery(path, params) {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

const stateOf = (version) => version.attributes.appVersionState ?? version.attributes.appStoreState;

/** The App Store version to work on: the one named in listing.json, else the only one that can still change. */
export function pickVersion(versions, versionString) {
  const named = versions.find((v) => v.attributes.versionString === versionString);
  if (named) return named;
  const editable = versions.filter((v) => EDITABLE.has(stateOf(v)));
  return editable.length === 1 ? editable[0] : null;
}

/** The build to submit: the newest one, or the one with `number`. Says whether it can be used yet. */
export function pickBuild(builds, number) {
  const usable = builds.filter((b) => !b.attributes.expired);
  const build = number
    ? usable.find((b) => b.attributes.version === String(number))
    : usable.sort((a, b) => Number(b.attributes.version) - Number(a.attributes.version))[0];
  if (!build) return { state: "missing", build: null };
  const processing = build.attributes.processingState;
  if (processing === "VALID") return { state: "ready", build };
  if (processing === "PROCESSING") return { state: "processing", build };
  return { state: "failed", build };
}

/** Whether the set already holds exactly these files, in this order, fully processed. */
export function sameScreenshots(existing, wanted) {
  return (
    existing.length === wanted.length &&
    existing.every(
      (shot, i) =>
        shot.attributes.fileName === wanted[i].fileName &&
        shot.attributes.sourceFileChecksum === wanted[i].checksum &&
        shot.attributes.assetDeliveryState?.state === "COMPLETE",
    )
  );
}

/** The review contact fields App Review needs that are still empty. */
export function missingContact(detail) {
  const a = detail?.attributes ?? {};
  return ["contactFirstName", "contactLastName", "contactPhone", "contactEmail"].filter((k) => !String(a[k] ?? "").trim());
}

/** Reads listing.json and the screenshot files it names. */
export function readListing(file = LISTING) {
  const listing = JSON.parse(readFileSync(file, "utf8"));
  const root = dirname(file);
  listing.files = listing.screenshots.map((rel) => {
    const bytes = readFileSync(join(root, rel));
    return { fileName: basename(rel), bytes, checksum: createHash("md5").update(bytes).digest("hex") };
  });
  return listing;
}

async function findVersion(api, listing) {
  const res = await api.get(withQuery(`/v1/apps/${listing.appId}/appStoreVersions`, { "filter[platform]": "IOS", limit: "20" }));
  const version = pickVersion(res.data, listing.version);
  if (!version) throw new Error(`App Store Connect has no iOS version ${listing.version} for app ${listing.appId}`);
  return version;
}

async function screenshotSet(api, versionId, listing, create) {
  const locs = await api.get(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const loc = locs.data.find((l) => l.attributes.locale === listing.locale);
  if (!loc) throw new Error(`Version ${listing.version} has no ${listing.locale} localization`);
  const sets = await api.get(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
  const found = sets.data.find((s) => s.attributes.screenshotDisplayType === listing.screenshotDisplayType);
  if (found || !create) return found ?? null;
  const made = await api.post("/v1/appScreenshotSets", {
    data: {
      type: "appScreenshotSets",
      attributes: { screenshotDisplayType: listing.screenshotDisplayType },
      relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } },
    },
  });
  return made.data;
}

async function uploadOne(api, setId, file) {
  const made = await api.post("/v1/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: { fileName: file.fileName, fileSize: file.bytes.length },
      relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } },
    },
  });
  const id = made.data.id;
  for (const op of made.data.attributes.uploadOperations ?? []) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const res = await api.upload(op.url, { method: op.method, headers, body: file.bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`Uploading ${file.fileName} failed with ${res.status}`);
  }
  await api.patch(`/v1/appScreenshots/${id}`, {
    data: { type: "appScreenshots", id, attributes: { uploaded: true, sourceFileChecksum: file.checksum } },
  });
  return id;
}

/** Makes the version's screenshot set hold exactly the files of listing.json. */
export async function syncScreenshots(api, listing, { sleep = sleepFor, waitMs = 5 * 60 * 1000 } = {}) {
  const version = await findVersion(api, listing);
  if (!EDITABLE.has(stateOf(version))) {
    log(`Screenshots: version ${listing.version} is ${stateOf(version)}, so its screenshots cannot change now.`);
    return "locked";
  }
  const set = await screenshotSet(api, version.id, listing, true);
  const existing = (await api.get(`/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
  if (sameScreenshots(existing, listing.files)) {
    log(`Screenshots: the ${listing.files.length} screenshots are already in place.`);
    return "unchanged";
  }
  for (const shot of existing) await api.del(`/v1/appScreenshots/${shot.id}`);
  const ids = [];
  for (const file of listing.files) {
    ids.push(await uploadOne(api, set.id, file));
    log(`Screenshots: uploaded ${file.fileName}.`);
  }
  const deadline = Date.now() + waitMs;
  for (const [i, id] of ids.entries()) {
    for (;;) {
      const state = (await api.get(`/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState ?? {};
      if (state.state === "COMPLETE") break;
      if (state.state === "FAILED") {
        const why = (state.errors ?? []).map((e) => e.description ?? e.code).join("; ");
        throw new Error(`Apple refused ${listing.files[i].fileName}: ${why || "no reason given"}`);
      }
      if (Date.now() > deadline) throw new Error(`Apple had not finished processing ${listing.files[i].fileName} after ${waitMs / 60000} minutes`);
      await sleep(5000);
    }
  }
  await api.patch(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
    data: ids.map((id) => ({ type: "appScreenshots", id })),
  });
  log(`Screenshots: ${ids.length} screenshots uploaded and processed, in the order of listing.json.`);
  return "uploaded";
}

/** Attaches the build and submits the version for App Review, unless it is already submitted. */
export async function submitForReview(api, listing, { build: number, sleep = sleepFor, waitMs = 60 * 60 * 1000 } = {}) {
  const version = await findVersion(api, listing);
  const state = stateOf(version);
  if (SUBMITTED.has(state)) {
    log(`Submit: version ${listing.version} is already ${state}; nothing to do.`);
    return "already";
  }
  if (!EDITABLE.has(state)) throw new Error(`Version ${listing.version} is ${state}, which cannot be submitted`);

  const deadline = Date.now() + waitMs;
  let picked;
  for (;;) {
    const builds = await api.get(withQuery("/v1/builds", { "filter[app]": listing.appId, sort: "-uploadedDate", limit: "20" }));
    picked = pickBuild(builds.data, number);
    if (picked.state === "ready") break;
    if (picked.state === "failed") throw new Error(`Build ${picked.build.attributes.version} is ${picked.build.attributes.processingState}`);
    if (Date.now() > deadline) throw new Error(`Build ${number ?? "(newest)"} was not processed within ${waitMs / 60000} minutes`);
    log(`Submit: waiting for build ${number ?? picked.build?.attributes.version ?? "(newest)"} (${picked.state}).`);
    await sleep(60 * 1000);
  }
  const buildId = picked.build.id;
  const current = await api.get(`/v1/appStoreVersions/${version.id}/build`);
  if (current?.data?.id !== buildId) {
    await api.patch(`/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: "builds", id: buildId } });
    log(`Submit: build ${picked.build.attributes.version} attached to version ${listing.version}.`);
  } else log(`Submit: build ${picked.build.attributes.version} is already attached.`);

  const detail = await api.get(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
  const missing = missingContact(detail?.data);
  if (missing.length) throw new Error(`App Review information is missing ${missing.join(", ")}: fill it in under App Review Information in App Store Connect`);

  const open = await api.get(
    withQuery("/v1/reviewSubmissions", { "filter[app]": listing.appId, "filter[platform]": "IOS", "filter[state]": "READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES" }),
  );
  if (open.data.some((s) => ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(s.attributes.state))) {
    log("Submit: a submission is already waiting for or in review; nothing to do.");
    return "already";
  }
  let submission = open.data.find((s) => ["READY_FOR_REVIEW", "UNRESOLVED_ISSUES"].includes(s.attributes.state));
  if (!submission) {
    submission = (
      await api.post("/v1/reviewSubmissions", {
        data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: listing.appId } } } },
      })
    ).data;
  }
  const items = await api.get(withQuery(`/v1/reviewSubmissions/${submission.id}/items`, { include: "appStoreVersion" }));
  const hasVersion = items.data.some((item) => item.relationships?.appStoreVersion?.data?.id === version.id);
  if (!hasVersion) {
    await api.post("/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
        },
      },
    });
  }
  await api.patch(`/v1/reviewSubmissions/${submission.id}`, { data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } } });
  log(`Submit: version ${listing.version} with build ${picked.build.attributes.version} is submitted for App Review.`);
  return "submitted";
}

/** A read-only report, also shown as a notice on the workflow run. */
export async function status(api, listing) {
  const version = await findVersion(api, listing);
  const set = await screenshotSet(api, version.id, listing, false);
  const shots = set ? (await api.get(`/v1/appScreenshotSets/${set.id}/appScreenshots`)).data.length : 0;
  const builds = await api.get(withQuery("/v1/builds", { "filter[app]": listing.appId, sort: "-uploadedDate", limit: "5" }));
  const attached = await api.get(`/v1/appStoreVersions/${version.id}/build`).catch(() => null);
  const detail = await api.get(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
  const missing = missingContact(detail?.data);
  const lines = [
    `Version ${listing.version}: ${stateOf(version)}`,
    `Screenshots (${listing.screenshotDisplayType}): ${shots}`,
    `Builds: ${builds.data.map((b) => `${b.attributes.version} ${b.attributes.processingState}`).join(", ") || "none"}`,
    `Attached build: ${attached?.data ? builds.data.find((b) => b.id === attached.data.id)?.attributes.version ?? attached.data.id : "none"}`,
    `App Review contact: ${missing.length ? "missing " + missing.join(", ") : "complete"}`,
  ];
  for (const line of lines) log(line);
  return lines;
}

const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

async function main(argv) {
  const args = new Set(argv);
  const buildAt = argv.indexOf("--build");
  const build = buildAt >= 0 ? argv[buildAt + 1] : process.env.ASC_BUILD || undefined;
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) throw new Error("ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH must be set");
  const api = client({ keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, privateKey: createPrivateKey(readFileSync(ASC_KEY_PATH)) });
  const listing = readListing();
  const done = [];
  if (args.has("--listing")) {
    args.add("--screenshots");
    if (listing.submit === true) args.add("--submit");
  }
  const chosen = build ?? (args.has("--listing") && listing.build ? String(listing.build) : undefined);
  if (chosen !== undefined && !/^[0-9]+$/.test(chosen)) throw new Error(`The build number must be digits, not ${chosen}`);
  if (args.has("--screenshots")) done.push(`Screenshots: ${await syncScreenshots(api, listing)}`);
  if (args.has("--submit")) done.push(`Submit: ${await submitForReview(api, listing, { build: chosen })}`);
  const report = await status(api, listing);
  console.log(`::notice title=App Store Connect::${escape([...done, ...report].join("\n"))}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.log(`::error title=App Store Connect::${escape(String(error?.message ?? error))}`);
    console.error(`Error: ${error?.message ?? error}`);
    process.exit(1);
  });
}
