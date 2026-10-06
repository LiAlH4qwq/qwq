# docs/AGENTS.md

Instructions specific to `docs/` and `docs/zh/`. Read
[`../AGENTS.md`](../AGENTS.md) first.

- Documentation is **bilingual**: `docs/` is English, `docs/zh/` is 简体中文.
  Keep the two trees in sync — when you add or edit a page, do it in both and
  add it to both `SUMMARY.md` files.
- The site is built with **mdBook** by [`nix/website.nix`](../nix/website.nix)
  and deployed to GitHub Pages by the generated `pages` workflow. `docs/` builds
  to `en/`, `docs/zh/` to `zh/`, with a language-chooser landing page.
- Keep the READMEs short and cross-referenced
  ([`README.md`](../README.md) ⇄ [`README.CN.md`](../README.CN.md)); long-form
  content belongs here.
- The `theme/lang.js` files add the language switch to the right-hand button
  row; they are the only JavaScript here and use plain browser globals.
