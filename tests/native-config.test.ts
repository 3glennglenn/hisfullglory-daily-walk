// The store app's identity and the iOS project, read as text (D-01, D-02, D-03, D-14). These files are edited on
// Windows and only built on macOS runners, so the facts that matter for signing and review are pinned here.
// Not proven here: that the project compiles, signs or uploads. Only a run of the iOS TestFlight workflow proves that.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import config from "../capacitor.config.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const IOS = "ios/App/App";
const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");

/** The value of a plist <key> in a flat plist, as the raw XML that follows it. */
function plistValue(xml: string, key: string): string | null {
  const m = xml.match(new RegExp(`<key>${key.replace(/[.~]/g, "\\$&")}</key>\\s*(<(\\w+)\\s*/>|<(\\w+)>[\\s\\S]*?</\\3>)`));
  return m ? m[1] : null;
}
const strings = (xml: string | null) => [...(xml ?? "").matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);

/** The build settings block of each XCBuildConfiguration, by object ID. */
function buildConfigurations(): Map<string, { name: string; body: string }> {
  const out = new Map<string, { name: string; body: string }>();
  for (const m of pbxproj.matchAll(/\t\t([0-9A-F]{24}) \/\* (\w+) \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;([\s\S]*?)\n\t\t\};/g))
    out.set(m[1], { name: m[2], body: m[3] });
  return out;
}
function appTargetConfigurations() {
  const list = pbxproj.match(/\/\* Build configuration list for PBXNativeTarget "App" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/);
  assert.ok(list, "the App target has a configuration list");
  const ids = [...list[1].matchAll(/([0-9A-F]{24})/g)].map((m) => m[1]);
  const all = buildConfigurations();
  const pick = (name: string) => {
    const id = ids.find((i) => all.get(i)?.name === name);
    assert.ok(id, "App target has a " + name + " configuration");
    return { id, body: all.get(id)!.body };
  };
  return { debug: pick("Debug"), release: pick("Release"), all };
}
const setting = (body: string, key: string) => body.match(new RegExp(`\\n\\t+${key} = ([^;]+);`))?.[1] ?? null;

test("capacitor.config.ts is the permanent identity with the bundled web build and no remote start address", () => {
  assert.equal(config.appId, "com.hisfullglory.app");
  assert.equal(config.appName, "HisFullGlory");
  assert.equal(config.webDir, "dist");
  assert.equal("server" in config, false, "no server block at all");
  assert.doesNotMatch(read("capacitor.config.ts"), /\bserver\s*:/);
});

test("Info.plist: display name, export compliance, iPhone and iPad orientations (D-14)", () => {
  const plist = read(IOS + "/Info.plist");
  assert.deepEqual(strings(plistValue(plist, "CFBundleDisplayName")), ["HisFullGlory"]);
  assert.equal(plistValue(plist, "ITSAppUsesNonExemptEncryption"), "<false/>");
  assert.deepEqual(strings(plistValue(plist, "UISupportedInterfaceOrientations")).sort(), [
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight",
    "UIInterfaceOrientationPortrait",
  ]);
  assert.deepEqual(strings(plistValue(plist, "UISupportedInterfaceOrientations~ipad")).sort(), [
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight",
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
  ]);
  assert.equal(plistValue(plist, "UIRequiresFullScreen"), null, "iPad multitasking stays allowed");
});

test("App.entitlements carries Sign in with Apple (Default) and nothing else", () => {
  const ent = read(IOS + "/App.entitlements");
  assert.deepEqual(strings(plistValue(ent, "com.apple.developer.applesignin")), ["Default"]);
  assert.equal([...ent.matchAll(/<key>/g)].length, 1, "one entitlement; no push (aps-environment) this phase");
});

test("PrivacyInfo.xcprivacy: file timestamps for C617.1, no tracking, no collected data", () => {
  const priv = read(IOS + "/PrivacyInfo.xcprivacy");
  assert.equal(plistValue(priv, "NSPrivacyTracking"), "<false/>");
  assert.match(priv, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  assert.match(priv, /<string>NSPrivacyAccessedAPICategoryFileTimestamp<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>C617\.1<\/string>\s*<\/array>/);
});

test("project.pbxproj: the entitlements and privacy files are in the App group, the privacy file is bundled", () => {
  const ref = (name: string) => pbxproj.match(new RegExp(`([0-9A-F]{24}) /\\* ${name.replace(".", "\\.")} \\*/ = \\{isa = PBXFileReference;`))?.[1];
  const ent = ref("App.entitlements");
  const priv = ref("PrivacyInfo.xcprivacy");
  assert.ok(ent && priv, "file references exist");
  const group = pbxproj.match(/\/\* App \*\/ = \{\n\t\t\tisa = PBXGroup;([\s\S]*?)\n\t\t\};/)?.[1] ?? "";
  assert.ok(group.includes(ent) && group.includes(priv), "both sit in the App group");
  const build = pbxproj.match(new RegExp(`([0-9A-F]{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${priv}`))?.[1];
  assert.ok(build, "a build file for the privacy manifest");
  const resources = pbxproj.match(/isa = PBXResourcesBuildPhase;([\s\S]*?)runOnlyForDeploymentPostprocessing/)?.[1] ?? "";
  assert.ok(resources.includes(build), "the privacy manifest is in the App target's Resources phase");
  const ids = [...pbxproj.matchAll(/^\t\t([0-9A-F]{24}) /gm)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "object IDs are unique");
});

test("project.pbxproj: the App target signs Release manually for the App Store, and only the App target (D-03)", () => {
  assert.equal(pbxproj.split("PROVISIONING_PROFILE_SPECIFIER").length - 1, 1, "exactly one profile setting");
  const { debug, release, all } = appTargetConfigurations();
  assert.equal(setting(release.body, "PROVISIONING_PROFILE_SPECIFIER"), '"HisFullGlory App Store"');
  assert.equal(setting(release.body, "CODE_SIGN_STYLE"), "Manual");
  assert.equal(setting(release.body, "CODE_SIGN_IDENTITY"), '"Apple Distribution"');
  assert.equal(setting(debug.body, "CODE_SIGN_STYLE"), "Automatic", "Debug keeps automatic signing");
  for (const c of [debug, release]) {
    assert.equal(setting(c.body, "DEVELOPMENT_TEAM"), "5ZYRJ5FZPU");
    assert.equal(setting(c.body, "CODE_SIGN_ENTITLEMENTS"), "App/App.entitlements");
    assert.equal(setting(c.body, "TARGETED_DEVICE_FAMILY"), '"1,2"', "iPhone and iPad (D-14)");
    assert.equal(setting(c.body, "MARKETING_VERSION"), "1.0.0");
    assert.equal(setting(c.body, "PRODUCT_BUNDLE_IDENTIFIER"), "com.hisfullglory.app");
  }
  for (const [id, c] of all)
    if (id !== release.id) assert.equal(setting(c.body, "PROVISIONING_PROFILE_SPECIFIER"), null, c.name + " " + id + " has no profile");
});

test("the app icon has no alpha channel and one image is 1024 x 1024; the launch screen has a dark variant", () => {
  const dir = IOS + "/Assets.xcassets/AppIcon.appiconset";
  const pngs = readdirSync(dir).filter((f) => f.endsWith(".png"));
  assert.ok(pngs.length > 0, "the icon set has images");
  let large = 0;
  for (const f of pngs) {
    const b = readFileSync(dir + "/" + f);
    assert.equal(b.subarray(12, 16).toString("latin1"), "IHDR", f + " is a PNG");
    assert.equal(b[25], 2, f + " is RGB without alpha (IHDR colour type 2)");
    if (b.readUInt32BE(16) === 1024 && b.readUInt32BE(20) === 1024) large++;
  }
  assert.ok(large >= 1, "one icon is 1024 x 1024");
  const splash = JSON.parse(read(IOS + "/Assets.xcassets/Splash.imageset/Contents.json"));
  for (const image of splash.images) assert.ok(existsSync(IOS + "/Assets.xcassets/Splash.imageset/" + image.filename), image.filename);
  assert.ok(splash.images.some((i: { appearances?: { value: string }[] }) => i.appearances?.some((a) => a.value === "dark")), "a dark launch image");
});

test("the copied web build and generated config are not part of the repository's iOS files", () => {
  const ignore = read("ios/.gitignore");
  for (const entry of ["App/App/public", "App/App/capacitor.config.json", "App/App/config.xml", "DerivedData", "xcuserdata"])
    assert.ok(ignore.includes(entry), "ios/.gitignore lists " + entry);
});
