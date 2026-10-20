# Daily context-check routine

A cloud routine writes one new context check a day and publishes it to `main` without
anyone reading it first. This page is the decision record, the safeguards, the command
reference and the full routine prompt. The checks themselves are described in
`site/README.md` ("Topic pages, articles and context checks").

## 1. Decision

On 2026-10-16 the founder decided, in his words: "a and b and i don't have to review them".
A daily routine writes one new context check and publishes it to `main` without his
review. This replaces the rule "nothing goes online before the founder approves it" for
context checks only. Topic pages, articles and study notes still need his approval. The
eleven checks of 2026-10-13 stay approved and look exactly as before.

## 2. What a run does

One new check per day, for the next verse in `scripts/context-check-queue.json`:

- one new file, `site/content/context-checks/<slug>.json`, with `"review": "ai-unreviewed"`;
- one commit and one push to `main`, which rebuilds the app and the site (2 Vercel
  deployments a day, far inside the Hobby limit of 100).

Nothing else is changed. The run stops without writing anything when a safeguard fails.

## 3. Safeguards

The label says plainly that the context is written by AI, never the Bible. At the top of
the page: "Context written by AI, from the sources below. The Bible text is the World English Bible." On list cards (the overview and the chapter page of
the verse): "Context written by AI, from named sources." At the bottom: "This context was written by an AI model to help you see the verse in its setting. The Bible text is the World English Bible. Before publishing, an automatic check made sure every source below opens and every quotation matches its source. It can contain mistakes. If a source says otherwise, tell us." Today in the app and the site home show the newest published context
check, AI-unreviewed ones included, always with the label "Context written by AI, from named sources." (founder, 2026-10-19;
the words were changed on 2026-10-20, when he asked to take "not checked by a person" out).

| | Safeguard | Where it is enforced |
| --- | --- | --- |
| S1 | A real person is only quoted if the exact words stand on the page their source links to. | CLI, at publish time: `checkSources` fetches each source and looks for each voice's words (quote marks, dashes, case and whitespace are ignored; an ellipsis is not a match). The build allows no other quotation marks than the curly double quotes for WEB text in an AI-unreviewed check, so people's words can only appear as voices. |
| S2 | Every source exists online and opens. | CLI, at publish time: HTTP 200 after redirects and a text page (HTML or plain text), otherwise a "could not reach" failure, never a silent pass. The build requires at least two sources, so a run without network access cannot publish. |
| S3 | The page says the context was written by AI, names its sources and says it can contain mistakes. | Build (`site/src/lib/content.ts`): review `ai-unreviewed` needs drafted `ai`, a named model, no approved date. Topic pages and articles cannot use the status. Built-page tests check the label, the card labels and the closing note. |
| S4 | Bible quotations are World English Bible only and match the verse text. | Build: every curly quotation must occur in the WEB text of the verse or its `basis` passages. No licensed translation may be named. |
| S5 | The decision is recorded. | This page, `CLAUDE.md` and `site/README.md`. |

Also at publish time, in the CLI: the verse must be one in the queue, no other check may
cover it, only one AI-unreviewed check may be written per day, the hook must read "You know
... But did you know ...", and no other check may have the same hook.

## 4. What the checks cannot catch

Machines check exact quotations and that sources open. Nobody checks the story. These
get through:

- a wrong claim told in the writer's own words;
- a source that is misread, or a source that does not say what the story says it does;
- a quotation that is true but taken out of its context;
- a tone that does not suit the faith or the reader.

That is why every page says so, and why a reader is invited to send a source that says
otherwise.

## 5. Taking one down, or approving one

Take one down: delete the file, or set `"review": "draft"`, through a pull request.

Approve one: set `"review": "approved"` and `"approved": "<date>"`, and add its slug to the
list of approved checks in `tests/context-routine.test.ts` in the same change. That test fails
if a check says "approved" without being on the list, so the routine cannot approve its own
work. Approving a check changes its label and closing note, not whether it is shown: Today in
the app and the site home show the newest published check either way (D-06).

## 6. The command line

Run from the repository root with Node 22.12 or newer and the flag that lets Node read the
site's TypeScript:

```text
node --experimental-strip-types scripts/context-checks.mjs status
node --experimental-strip-types scripts/context-checks.mjs next
node --experimental-strip-types scripts/context-checks.mjs text <book> <chapter>
node --experimental-strip-types scripts/context-checks.mjs sources <file>
node --experimental-strip-types scripts/context-checks.mjs verify <draft.json> --model "<name>"
node --experimental-strip-types scripts/context-checks.mjs add <draft.json> --model "<name>"
```

- `status`: checks on file by review, and how many verses are left in the queue.
- `next`: the next uncovered verse (and two alternates) with the WEB text of the verse and
  of its whole chapter, and the two checks to read as models.
- `text`: the WEB text of one chapter.
- `sources`: network check only, for any check file. Opens every source and looks for every
  voice's words. Writes nothing. This is also the routine's network self-test.
- `verify`: every check `add` runs, without writing.
- `add`: the same checks, and only then the new file. It never overwrites a file and never
  writes `approved`. `--model` is required.

The only option is `--model`. Every other option is refused, so no option can skip a check.
Behind a proxy (`HTTPS_PROXY`), the command restarts itself once with `NODE_USE_ENV_PROXY=1`
so that fetch uses the proxy. That changes how the network is reached, not which checks run.

A draft file holds `slug` (optional, it must equal the slug of the verse), `verse`, `hook`,
`story`, `storyStatus`, `sources`, `voices`, `moment`, `around`, `readings`, `argued`
(optional), `point` and `basis`, as in `matthew-5-39.json`. `add` sets `review`, `drafted`,
`model` and `written` itself.

## 7. The queue

`scripts/context-check-queue.json` lists 60 well-known verses, references only, none
covered by an approved check. Add more by pull request when `status` shows it running low.
When `next` reports the queue empty, pause the routine on its page.

## 8. Network setup (the founder does this)

The default cloud environment is "Trusted": only a short list of domains (package
registries, GitHub, Anthropic) can be reached. Sites such as sefaria.org, wikipedia.org and
gutenberg.org answer 403 with `host_not_allowed`. The routine therefore needs its own
environment with network access "Full" (or a "Custom" allowlist):

1. Go to claude.ai/code/routines and open the routine.
2. Menu, Edit, then the cloud icon with the environment name, then the settings icon,
   Edit cloud environment, Network access.
3. Make a separate environment (for example "Context checks") with network access Full, and
   choose it for this routine. Leave the Default environment as it is: the AI-explanations
   routine uses it, and changing it affects every cloud session.
4. Test with Run now and read the transcript for `host_not_allowed`.

Without network access every run stops at the self-test and publishes nothing. A green run
status only means no infrastructure error, not that the check was written; read the report.

## 9. Routine prompt

Paste this as the routine's instructions.

```text
You are the daily HisFullGlory context-check routine for the repository 3glennglenn/hisfullglory-daily-walk. You write ONE new context check and publish it to main. Nobody reads it before it goes online, so every rule below is a hard rule. When a rule cannot be kept, write nothing and report why. Never work around a failed check.

SETUP
1. Work on main in the checked-out repository: git checkout main, then git pull --rebase origin main.
2. Run node --version. It must be 22.12 or newer; if not, stop and report.

READ FIRST
- CLAUDE.md (the Direction bullets on context checks).
- site/README.md (the section "Topic pages, articles and context checks").
- docs/CONTEXT_CHECKS_ROUTINE.md.
- site/content/context-checks/matthew-5-39.json and site/content/context-checks/psalm-46-10.json, as models of voice, structure and length.

NETWORK SELF-TEST
Run: node --experimental-strip-types scripts/context-checks.mjs sources site/content/context-checks/matthew-5-39.json
If it reports that sources could not be reached, or mentions host_not_allowed, STOP. Write nothing. Report: "could not reach the sources; the routine's environment needs network access".

CHOOSE THE VERSE
Run: node --experimental-strip-types scripts/context-checks.mjs next
Take the first candidate (it also prints two alternates, the WEB text of the verse and of its whole chapter). If it says the queue is empty, stop and report that.

RESEARCH
Use WebSearch and WebFetch. Use only pages that you actually opened and read. Prefer openly readable, reputable pages that a script can read as text: no PDFs, and no pages that only show their text with JavaScript (the Sefaria text pages are like that: do not use them as the source of a voice). Look for history, anecdotes and striking facts around the verse and for named people who said something about this passage.
Quote a person only with words copied from the page you opened, as one continuous run: no ellipses, no joining of two places. A script checks every quotation against its page. When a page does not hold the words, drop the quotation, or say it in your own words without quotation marks.

WRITE THE DRAFT
Write the draft as JSON to /tmp/context-check.json, following the README rules and the two model files:
- verse: exactly the candidate. basis: the passages around it that you quote. slug: the slug that next printed.
- hook: in the form "You know ... But did you know ...", 60 to 160 characters, different from every other hook.
- story: the story around the verse, told with feeling but never larger than its sources. storyStatus honest: scripture, history or reading.
- moment, around, readings (told with respect, side by side, without a winner), point, and argued only when sources show people arguing over this passage.
- sources: at least two pages you opened, each with an https link. Every voice's source must also be in sources.
- voices: only named people, words copied word for word from their own linked page.
- Curly double quotes only around words from the WEB text of the verse or its basis passages. No other quotation marks at all: not single curly quotes, not straight quotes, not guillemets. The words of people go in voices.
- No em dashes. American English. Do not name any translation other than the WEB (no NIV, ESV and so on).
- Do not write review, drafted, model, written or approved: the add command sets them.

VERIFY
Run: node --experimental-strip-types scripts/context-checks.mjs verify /tmp/context-check.json --model "<the name of the model you are>"
If it prints problems, fix the draft and run it again, up to five times in all. Drop a quotation that is not found. Replace a source that does not open. If it still fails, try the next candidate once, from the start of RESEARCH. If that fails too, stop and report. Write nothing.

ADD
Run: node --experimental-strip-types scripts/context-checks.mjs add /tmp/context-check.json --model "<the name of the model you are>"

TESTS
Run: node --experimental-strip-types --test tests/context.test.ts tests/context-routine.test.ts
Then: cd site, npm ci, npm run check. If npm cannot reach the registry, say so in your report. The verify and add commands above are never skipped.
If a test fails, delete the new file, write nothing and report.

ALLOWED-PATH GATE
Run git status --porcelain. It must show exactly one line: the new file under site/content/context-checks/. Open it: it must say "review": "ai-unreviewed" and must have no "approved" field. If anything else changed or the file is different, restore everything (git checkout -- for tracked files, delete the new file), write nothing and report.

COMMIT AND PUSH
Commit only that file, with this message and a Co-Authored-By trailer that names the model you are:
Add context check <Reference>, written by an AI model, not checked by a person
Push to origin main. If the push is rejected, run git pull --rebase origin main, run the tests again, and push again, up to three times in all. Never force-push. If it still fails, push the commit to a branch named wip-context-check-<YYYY-MM-DD> (it gets no Vercel deployment) and report it.

NEVER
- Change any file other than the one new check.
- Set review to approved, or edit the queue, the scripts, the tests or the docs.
- Write about a verse that another check already covers, or write two checks in one day.
- Publish when verify failed, when a source could not be reached, or when you are unsure.

FINAL REPORT
Give: the reference, the slug, https://hisfullglory.com/context-checks/<slug>, the sources opened, the quotations you dropped, anything that failed or was skipped, and the commit SHA. Or, if nothing was published, say exactly why.
```

## 10. Status

The routine is created after the founder has merged the pull request that brought this
page, and after he has made the environment with network access (section 8). Suggested name
"HisFullGlory: daily context check", once a day after the AI-explanations routine
(04:00 UTC), for example 05:00 UTC. Test it with Run now before the first scheduled run.
Not done yet: the routine has not been created and nothing has run.
