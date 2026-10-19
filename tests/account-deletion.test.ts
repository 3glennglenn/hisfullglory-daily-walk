import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deletedWithAccount, isDeleteConfirmation } from "../src/platform/deleteConfirm.ts";
import { supportEmailReady } from "../site/src/data/legal.ts";

test("the typed word DELETE is accepted in any letter case, with spaces around it", () => {
  for (const typed of ["DELETE", "delete", " Delete ", "dElEtE", "\tdelete\n"]) assert.equal(isDeleteConfirmation(typed), true, JSON.stringify(typed));
});

test("every other value is refused", () => {
  for (const typed of ["DELETED", "", "   ", "DEL ETE", "remove", "delet", "xdelete", "DELETE ME", "d e l e t e"]) assert.equal(isDeleteConfirmation(typed), false, JSON.stringify(typed));
});

test("the card lists what is deleted in the same words as the public delete-account page", () => {
  const page = readFileSync("site/src/pages/delete-account.astro", "utf8");
  const section = page.slice(page.indexOf('id="what-is-deleted"'));
  const list = section.slice(section.indexOf("<ul>"), section.indexOf("</ul>"));
  const onPage = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.equal(onPage.length, 6);
  assert.deepEqual(deletedWithAccount, onPage);
});

test("the app and the site read the support flag from the same file", () => {
  const config = readFileSync("src/config.ts", "utf8");
  assert.match(config, /import \{[^}]*supportEmailReady[^}]*\} from "\.\.\/site\/src\/data\/legal\.ts"/);
  assert.equal(typeof supportEmailReady, "boolean");
});

test("the folder of legal.ts has a tsconfig of its own, so the app builds without the site's packages", () => {
  // The app is installed without site/node_modules. Vite and esbuild read the nearest tsconfig.json of
  // every .ts file, and site/tsconfig.json extends astro/tsconfigs/strict, which then cannot be found:
  // the build failed on Vercel and would on a clean install (found on the first push of the trust branch).
  const own = JSON.parse(readFileSync("site/src/data/tsconfig.json", "utf8"));
  assert.equal(own.extends, undefined);
  assert.equal(typeof own.compilerOptions, "object");
});
