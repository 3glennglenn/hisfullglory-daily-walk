# hisfullglory.com (site)

The public website: static pages built with Astro. Plan and build order: `docs/WEBSITE_PLAN.md`.
The app in the repository root is not changed by anything in this folder.

## Run it

```
cd site
npm install
npm run dev      # http://127.0.0.1:4321
npm run build    # static files in site/dist
```

## What is shared with the app

`scripts/sync-shared.mjs` runs before `dev` and `build` and reads from the app:

- colour tokens (Light and Dark) from `src/styles.css`
- the brand icons from `public/`

The results are generated files (see `.gitignore`); do not edit them. If the app's token
block changes shape, the script stops the build with a clear message.

## Conventions

- `src/config.ts` holds the site name, the app and shop addresses and the navigation.
  A navigation item gets `ready: true` in the same change that adds its page, so the site
  never links to a page that does not exist.
- `/styleguide` is an internal reference page: not in the navigation, not indexed.
- Light and Dark follow the visitor's device setting. A manual switch can set
  `data-theme="light"` or `"dark"` on `<html>`; the tokens already support it.
- Copy rules: `docs/WEBSITE_PLAN.md`, section 5.

## Status

Step 1 of the build order is done: scaffold, shared tokens, layout, header and footer.
Not deployed. No Vercel project, domain, DNS or Shopify change has been made for the site.
