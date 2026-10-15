# UX review standard (UX-01)

Every pull request that adds or changes a screen, page, dialog or email gets a UX review
before it is opened, and the result is written in the pull request description. This is a
standing gate, not a one-off: it applies to the app (`src/`), the website (`site/`) and the
auth emails (`docs/auth-email/`).

The target is WCAG 2.2 level AA. The design contract for a phase (for example
`01-UI-SPEC.md`) says what to build; this page says how to check that it was built that way.

## The three reviews

Run all three on each surface you touched. They are Claude skills; the name in brackets is
what you invoke.

1. **Design critique** (`design:design-critique`): hierarchy, spacing, consistency with the
   existing screens, and whether the main action is obvious.
2. **UX copy review** (`design:ux-copy`): every label, button, hint, error and empty state.
3. **Accessibility review** (`design:accessibility-review`): the checklist below.

## Checklist

Tick each item for each surface. An item that does not apply is written as "n/a" with a
reason, never left blank.

- **Tokens only.** Colours, spacing and type come from the shared tokens in
  `src/styles.css`. No new hex values in a component, and no new token without adding it to
  both the Light and the Dark block at the same position.
- **Contrast.** `tests/tokens-contrast.test.ts` is green. It computes the WCAG ratio from the
  token hex values (relative luminance, not how a colour looks): 4.5:1 for text, 3:1 for the
  focus ring and control edges, in Light and in Dark. A new text colour pair is added to that
  test in the same pull request.
- **Focus.** The 3px `--strong` focus ring is visible on every control, and the focus order
  follows the reading order. A dialog moves focus into itself and returns it to the trigger.
- **Labels.** Every field has a visible label, not only a placeholder. Hints are tied to the
  field with `aria-describedby`.
- **Announcements.** Status and progress use `role="status"`. Errors use `role="alert"`, and
  the accessible text starts with the word "Error:" so colour is not the only cue.
- **Touch targets.** At least 44px high and wide for every control and every link in a list.
- **Reflow and text size.** At a 320px wide screen and at 200% text there is no horizontal
  scroll and no clipped text. Nothing has a fixed height; buttons grow with their text.
- **Motion.** `prefers-reduced-motion` is respected; nothing essential depends on animation.
- **Colour alone.** Information is never carried by colour alone: add words or an icon with a
  text alternative.
- **Copy.** Sentence case. No exclamation marks. No developer words (no "token", "payload",
  "null", "error code 500"). Use the words of the UI-SPEC glossary.
- **Languages and structure.** One `h1` per page, headings in order, lists as lists, `lang`
  set on pages and emails.

## How to record it

Add a section headed `UX-01 review` to the pull request description. For each surface list:
what the three reviews found, what was fixed, and anything left open with the reason. A
change that touches shared CSS (tokens, focus, form controls) is reviewed on the existing
screens it reaches, not only on the new ones.

## How to check

- Prefer measurements from the page itself: computed styles, `scrollWidth` against the
  viewport width, `getBoundingClientRect()` for target sizes, and the accessibility tree.
- Take screenshots only to diagnose a defect that a measurement cannot explain
  (`AGENTS.md`: screenshots only to diagnose a defect).
- Test in the build copy with the preview, in Light and in Dark, at 320px and at the normal
  phone width.
