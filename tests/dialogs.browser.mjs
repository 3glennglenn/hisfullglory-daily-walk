import { build } from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// The version the app asks for is read from the app, so this fixture follows it when it changes.
const TERMS_VERSION = readFileSync("src/platform/auth.tsx", "utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
// The questions that go to the network and used to be browser pop-ups (UI-SPEC A15, D-10), against a controlled
// SDK: deleting a public contribution, a public prayer update (optional and answered), closing and deleting a
// support request. Named choices, Escape and the backdrop as the safe choice, busy text, failures on the screen's
// own line, and focus that comes back. Synthetic fixture data only.
const FEED_POST = "c0000000-0000-4000-8000-000000000001";
const REQUEST = "f0000000-0000-4000-8000-000000000001";
export async function checkDialogs(browser, base) {
  const result = await build({
    entryPoints: ["tests/fixtures/dialogs.tsx"],
    bundle: true,
    write: false,
    outfile: ".tooling/dialogs-fixture.js",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "controlled-dialog-sdk",
        setup(b) {
          b.onResolve({ filter: /^\.\.\/supabase$/ }, () => ({ path: "sdk", namespace: "fixture" }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `
        const user='a0000000-0000-4000-8000-000000000001';
        const session={user:{id:user},access_token:'synthetic'};
        const f=window.dialogFixture={
          calls:[],mode:'ok',hold:false,pending:{},
          posts:[{origin_kind:'post',id:'${FEED_POST}',display_name:'Fixture reader',body:'Test-only public prayer',post_type:'prayer',source_path:null,created_at:'2026-10-07T00:00:00Z',is_owner:true,prayer_status:'Active',amen_count:0,helped_count:0,praying_count:0}],
          mine:[{id:'${REQUEST}',title:'Test-only request',status:'pending',expires_at:'2026-12-01T00:00:00Z'}],
          release(name){const done=f.pending[name];f.pending[name]=null;if(done)done();}
        };
        const answer=()=>f.mode==='error'?{data:null,error:{message:'failed'}}:{data:null,error:null};
        function rpc(name,args){
          f.calls.push({name,args});
          if(name==='read_aggregate_feed')return Promise.resolve({data:f.posts.slice(),error:null});
          if(name==='read_support_requests')return Promise.resolve({data:[],error:null});
          if(name==='delete_community_post'||name==='update_public_prayer'||name==='close_support_request'){
            if(f.hold)return new Promise(resolve=>{f.pending[name]=()=>resolve(answer());});
            return Promise.resolve(answer());
          }
          return Promise.resolve({data:null,error:null});
        }
        export const supabase={
          auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
          from(table){const q={select(){return q},eq(){return q},order(){return q},maybeSingle:async()=>({data:{version:'${TERMS_VERSION}'},error:null}),then(ok,fail){return Promise.resolve({data:table==='support_requests'?f.mine.slice():[],error:null}).then(ok,fail);}};return q;},
          rpc:(name,args)=>rpc(name,args||{})
        };
      `,
          }));
        },
      },
    ],
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? result.outputFiles[0].text;
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const c = await browser.newContext({ serviceWorkers: "block", viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errors = [];
  const consoleAll = [];
  const popups = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => consoleAll.push(m.type() + ": " + m.text()));
  p.on("dialog", (d) => {
    popups.push(d.type());
    void d.dismiss();
  });
  let checks = 0;
  const check = async (label, fn) => {
    await fn();
    checks++;
    console.log("PASS Dialogs browser:", label);
  };
  const fixture = (fn, arg) => p.evaluate(fn, arg);
  const calls = (name) => fixture((n) => window.dialogFixture.calls.filter((c) => c.name === n).map((c) => c.args), name);
  const reset = async () => {
    await fixture(() => {
      const f = window.dialogFixture;
      f.mode = "ok";
      f.hold = false;
      f.pending = {};
      f.calls.length = 0;
    });
  };
  const arrived = () => p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const focusedText = () => p.evaluate(() => document.activeElement?.textContent?.trim());
  try {
    await p.route(base + "/__dialogs-fixture", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<style>' + css + '</style><div id="root"></div><script>' + js + "</script>",
      }),
    );
    await p.goto(base + "/__dialogs-fixture");
    await p.getByText("Test-only public prayer", { exact: true }).waitFor();

    await check("deleting a public contribution: named choices, Keep, Escape and the backdrop delete nothing, Delete shows Deleting… and then goes", async () => {
      await reset();
      const dialog = p.getByRole("dialog", { name: "Delete this public contribution?", exact: true });
      const trigger = p.getByRole("button", { name: "Delete my contribution", exact: true });
      await trigger.click();
      await dialog.waitFor();
      assert.equal(await dialog.getByText("It is removed for everyone. This cannot be undone.", { exact: true }).count(), 1);
      assert.deepEqual(await dialog.getByRole("button").allInnerTexts(), ["Delete contribution", "Keep contribution"]);
      await dialog.getByRole("button", { name: "Keep contribution", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(await focusedText(), "Delete my contribution", "focus returns to the control that opened the dialog");
      await trigger.click();
      await dialog.waitFor();
      await p.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await trigger.click();
      await dialog.waitFor();
      await arrived();
      await p.mouse.click(4, 4);
      await dialog.waitFor({ state: "detached" });
      assert.deepEqual(await calls("delete_community_post"), [], "nothing was deleted");
      await fixture(() => {
        window.dialogFixture.hold = true;
      });
      await trigger.click();
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Delete contribution", exact: true }).click();
      const busy = dialog.getByRole("button", { name: "Deleting…", exact: true });
      await busy.waitFor();
      assert.equal(await busy.getAttribute("aria-disabled"), "true");
      assert.deepEqual(await calls("delete_community_post"), [{ post_id: FEED_POST }]);
      await p.keyboard.press("Escape");
      await p.mouse.click(4, 4);
      assert.equal(await dialog.count(), 1, "Escape and the backdrop wait while the work goes on");
      await fixture(() => window.dialogFixture.release("delete_community_post"));
      await dialog.waitFor({ state: "detached" });
      assert.equal((await calls("delete_community_post")).length, 1, "pressed once, sent once");
    });

    await check("a failed deletion closes the dialog and reports on the screen's own alert line", async () => {
      await reset();
      await fixture(() => {
        window.dialogFixture.mode = "error";
      });
      const dialog = p.getByRole("dialog", { name: "Delete this public contribution?", exact: true });
      await p.getByRole("button", { name: "Delete my contribution", exact: true }).click();
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Delete contribution", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      await p.getByRole("alert").filter({ hasText: "Deletion failed." }).waitFor();
      await reset();
    });

    await check("a public prayer update: optional for a new state, required for Answered; named safe choices; the words are kept after a failure", async () => {
      await reset();
      const state = p.getByLabel("Prayer state");
      // Optional update.
      const optional = p.getByRole("dialog", { name: "Add a public prayer update", exact: true });
      await state.selectOption("Waiting");
      await optional.waitFor();
      assert.equal(await optional.getByText("Optional. This update will be public.", { exact: true }).count(), 1);
      assert.deepEqual(await optional.getByRole("button").allInnerTexts(), ["Don't share update", "Share update"]);
      assert.equal(await optional.getByLabel("Your update", { exact: true }).inputValue(), "");
      assert.equal(await optional.getByRole("button", { name: "Share update", exact: true }).isEnabled(), true, "optional: an empty update can be shared");
      await optional.getByRole("button", { name: "Don't share update", exact: true }).click();
      await optional.waitFor({ state: "detached" });
      assert.deepEqual(await calls("update_public_prayer"), []);
      assert.equal(await state.inputValue(), "Active", "the prayer keeps its state until it is saved");
      await state.selectOption("Waiting");
      await optional.waitFor();
      await optional.getByRole("button", { name: "Share update", exact: true }).click();
      await optional.waitFor({ state: "detached" });
      assert.deepEqual(await calls("update_public_prayer"), [{ post_id: FEED_POST, new_status: "Waiting", update_body: "" }]);
      // Answered: the words are required.
      await reset();
      const answered = p.getByRole("dialog", { name: "How did God answer your prayer?", exact: true });
      await state.selectOption("Answered");
      await answered.waitFor();
      assert.equal(await answered.getByText("This update will be public.", { exact: true }).count(), 1);
      const share = answered.getByRole("button", { name: "Share update", exact: true });
      assert.equal(await share.isDisabled(), true, "Answered waits for words");
      await answered.getByLabel("Your update", { exact: true }).fill("God answered, slowly.");
      assert.equal(await share.isEnabled(), true);
      assert.equal(await answered.getByLabel("Your update", { exact: true }).getAttribute("maxlength"), "1000", "the server keeps public updates to 1,000 characters");
      // A failure: the sheet closes, the screen's alert says so, and the words come back when it opens again.
      await fixture(() => {
        window.dialogFixture.mode = "error";
        window.dialogFixture.hold = true;
      });
      await share.click();
      const busy = answered.getByRole("button", { name: "Saving…", exact: true });
      await busy.waitFor();
      assert.equal(await busy.getAttribute("aria-disabled"), "true");
      await fixture(() => window.dialogFixture.release("update_public_prayer"));
      await answered.waitFor({ state: "detached" });
      await p.getByRole("alert").filter({ hasText: "Prayer update could not be saved." }).waitFor();
      await reset();
      await state.selectOption("Answered");
      await answered.waitFor();
      assert.equal(await answered.getByLabel("Your update", { exact: true }).inputValue(), "God answered, slowly.", "the words were kept");
      // Escape asks nothing and keeps them too.
      await answered.getByLabel("Your update", { exact: true }).fill("Another thought");
      await p.keyboard.press("Escape");
      await answered.waitFor({ state: "detached" });
      await state.selectOption("Answered");
      await answered.waitFor();
      assert.equal(await answered.getByLabel("Your update", { exact: true }).inputValue(), "Another thought");
      await answered.getByRole("button", { name: "Don't share update", exact: true }).click();
      await answered.waitFor({ state: "detached" });
      assert.deepEqual(await calls("update_public_prayer"), [], "nothing was sent");
      await state.selectOption("Answered");
      await answered.waitFor();
      assert.equal(await answered.getByLabel("Your update", { exact: true }).inputValue(), "", "the named safe choice lets the words go");
      await p.keyboard.press("Escape");
      await answered.waitFor({ state: "detached" });
    });

    await check("Give: Keep it open and Keep request keep the request; Close request and Delete request say Closing… and Deleting… and then send", async () => {
      await reset();
      await fixture(() => window.dispatchEvent(new CustomEvent("fixture-screen", { detail: "give" })));
      await p.getByRole("button", { name: "My requests", exact: true }).click();
      await p.getByRole("heading", { name: "Test-only request", exact: true }).waitFor();
      // Close.
      const closing = p.getByRole("dialog", { name: "Close this support request?", exact: true });
      const closeButton = p.getByRole("button", { name: "Close", exact: true });
      await closeButton.click();
      await closing.waitFor();
      assert.deepEqual(await closing.getByRole("button").allInnerTexts(), ["Close request", "Keep it open"]);
      assert.equal(await closing.locator("button.danger").count(), 0, "closing is not destructive");
      await closing.getByRole("button", { name: "Keep it open", exact: true }).click();
      await closing.waitFor({ state: "detached" });
      assert.equal(await focusedText(), "Close", "focus returns to the control that opened the dialog");
      await closeButton.click();
      await closing.waitFor();
      await p.keyboard.press("Escape");
      await closing.waitFor({ state: "detached" });
      assert.deepEqual(await calls("close_support_request"), [], "nothing was closed");
      await fixture(() => {
        window.dialogFixture.hold = true;
      });
      await closeButton.click();
      await closing.waitFor();
      await closing.getByRole("button", { name: "Close request", exact: true }).click();
      await closing.getByRole("button", { name: "Closing…", exact: true }).waitFor();
      assert.deepEqual(await calls("close_support_request"), [{ request_id: REQUEST, remove_request: false }]);
      await fixture(() => window.dialogFixture.release("close_support_request"));
      await closing.waitFor({ state: "detached" });
      await p.getByText("Request updated.", { exact: true }).waitFor();
      // Delete.
      await reset();
      const deleting = p.getByRole("dialog", { name: "Delete this request?", exact: true });
      const deleteButton = p.getByRole("button", { name: "Delete my request", exact: true });
      await deleteButton.click();
      await deleting.waitFor();
      assert.deepEqual(await deleting.getByRole("button").allInnerTexts(), ["Delete request", "Keep request"]);
      assert.equal(await deleting.locator("button.danger").count(), 1, "deleting is the danger action");
      await deleting.getByRole("button", { name: "Keep request", exact: true }).click();
      await deleting.waitFor({ state: "detached" });
      assert.deepEqual(await calls("close_support_request"), []);
      await fixture(() => {
        window.dialogFixture.hold = true;
      });
      await deleteButton.click();
      await deleting.waitFor();
      await deleting.getByRole("button", { name: "Delete request", exact: true }).click();
      await deleting.getByRole("button", { name: "Deleting…", exact: true }).waitFor();
      assert.deepEqual(await calls("close_support_request"), [{ request_id: REQUEST, remove_request: true }]);
      await fixture(() => window.dialogFixture.release("close_support_request"));
      await deleting.waitFor({ state: "detached" });
      await reset();
    });

    await check("the sheets fit a 320 x 568 screen: nothing scrolls sideways and the buttons stay reachable at least 44px tall", async () => {
      await p.setViewportSize({ width: 320, height: 568 });
      await fixture(() => window.dispatchEvent(new CustomEvent("fixture-screen", { detail: "feed" })));
      await p.getByText("Test-only public prayer", { exact: true }).waitFor();
      await p.getByLabel("Prayer state").selectOption("Answered");
      const sheet = p.getByRole("dialog", { name: "How did God answer your prayer?", exact: true });
      await sheet.waitFor();
      await arrived();
      await sheet.getByLabel("Your update", { exact: true }).fill(Array.from({ length: 60 }, (_, i) => "Line " + i).join("\n"));
      const box = await sheet.evaluate((d) => {
        const r = d.getBoundingClientRect();
        return { bottom: r.bottom, height: r.height, scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, buttons: [...d.querySelectorAll("button")].map((b) => { const q = b.getBoundingClientRect(); return { height: q.height, inside: q.top >= r.top && q.bottom <= r.bottom && q.bottom <= innerHeight }; }) };
      });
      assert.equal(Math.round(box.bottom), 568);
      assert.ok(box.height <= 568 * 0.9 + 1);
      assert.ok(box.scrollWidth <= box.clientWidth + 1, "no sideways scroll");
      for (const b of box.buttons) {
        assert.ok(b.height >= 44, "button height " + b.height);
        assert.ok(b.inside, "button inside the screen");
      }
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await p.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
      await p.setViewportSize({ width: 375, height: 812 });
    });

    assert.deepEqual(popups, [], "no browser pop-up appeared");
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleAll.filter((line) => line.startsWith("error") || line.startsWith("warning")), []);
    console.log(checks + " dialog checks passed; synthetic fixtures only, no hosted claims.");
  } catch (error) {
    throw new Error(error.message + "\nDialogs fixture DOM: " + (await p.locator("body").innerText().catch(() => "(unavailable)")));
  } finally {
    await c.close();
  }
}
