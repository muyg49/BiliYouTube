# BiliYouTube Project Status

Last updated: 2026-10-16

## Repository

- GitHub: https://github.com/muyg49/BiliYouTube
- Default branch: `main`
- License: GPL-3.0
- Stack: WXT + Vue 3 + TypeScript
- Firefox first, Chromium compatibility where practical

## Project goal

Build a YouTube-style desktop interface for Bilibili as a browser extension, while keeping Bilibili's native player and avoiding unnecessary browser permissions.

The project must not copy BewlyCat, YouTubeCat, Bilibili-Evolved, or other projects' source code. Their architecture, API usage ideas, DOM strategies, selectors, and general implementation approaches may be studied and independently reimplemented.

## Current version

- Package version: `0.1.0`
- Current milestone: homepage MVP / Firefox publishing infrastructure
- Next planned milestone: `0.2.0` watch-page layout

## Implemented

### Project foundation

- WXT project initialized
- Vue 3 + TypeScript
- Firefox and Chromium build targets
- GitHub Actions CI
- End users do not need Node.js or pnpm; Node/pnpm are build-time tools used in CI

### Homepage MVP

- Custom BiliYouTube homepage UI
- YouTube-style fixed top bar
- Centered search field
- 240 px desktop sidebar with narrower responsive mode
- User avatar integration
- Navigation entries for history, favorites, watch later, dynamics, etc.
- Real following/UP list in the sidebar
- Bilibili recommendation feed
- Popular-feed fallback when recommendation requests fail
- 16:9 video cards
- Video title, uploader, avatar, view count, publish time, and duration
- Responsive multi-column grid
- Infinite loading
- Light/dark system theme support

### Bilibili API layer

Current background API layer includes:

- `x/web-interface/nav` for current user
- `x/web-interface/wbi/index/top/feed/rcmd` for recommendation feed
- `x/web-interface/popular` as fallback
- `x/relation/followings` for subscriptions/followings

Requests reuse the existing Bilibili browser session. No broad `cookies` permission is currently requested.

## Firefox / AMO

- AMO extension ID: `biliyoutube@muyg49.github.io`
- GitHub Actions secrets already configured:
  - `FIREFOX_JWT_ISSUER`
  - `FIREFOX_JWT_SECRET`
- Do not regenerate/revoke AMO credentials unless they are confirmed lost, invalid, or compromised.

### Initial AMO submission

Initial Firefox AMO submission succeeded on 2026-10-16.

- AMO slug: `biliyoutube`
- AMO version ID: `6583128`
- Developer version page: https://addons.mozilla.org/en-US/developers/addon/biliyoutube/versions/6583128
- Current state at this handoff: submitted to Mozilla; approval/signing/listing may still be pending.

The initial listing was created with `web-ext sign`. After creation, the normal WXT AMO update path was rechecked and `wxt submit --dry-run` succeeded, so AMO now recognizes the extension ID.

### Firefox manifest details

- Gecko ID: `biliyoutube@muyg49.github.io`
- Minimum Firefox version currently set to `142.0`
- Firefox data collection permission currently declares `websiteContent`

This declaration was added to satisfy Mozilla's newer Firefox extension data-consent requirements while the extension reads Bilibili page/API content.

### Release workflow

`.github/workflows/publish-firefox.yml` supports:

- GitHub Release based publishing
- Manual `workflow_dispatch` publishing with a version input
- Build/version derived from the release version rather than requiring the user to edit `package.json` manually before every AMO update

Expected normal release flow:

1. Finish a version.
2. Create a GitHub Release/tag such as `v0.2.0`.
3. GitHub Actions builds the Firefox package and source archive.
4. CI submits the new version to AMO with the stored JWT secrets.
5. Mozilla reviews/signs/publishes it.

## CI state at handoff

Latest checked `main` CI run for commit `57ce32d96dd9e298f554a0cf2258a38465e77520` completed successfully.

The Firefox package also passed `web-ext lint` with zero errors during initial AMO submission. Warnings observed at that time included an `innerHTML` warning from bundled/runtime code and a minimum-version/data-consent compatibility warning; the Firefox minimum version was then aligned to `142.0`.

## Architecture decisions

- Homepage: render our own Vue interface rather than continuously fighting Bilibili's homepage CSS.
- Watch page: keep and reuse Bilibili's native player rather than implementing video playback, qualities, login, and danmaku ourselves.
- Surrounding watch-page chrome will be replaced/restyled into a YouTube-like layout.
- Sidebar should use real Bilibili data instead of CSS pseudo-content.
- Minimize extension permissions.
- Firefox is the primary browser; Chromium should remain compatible where practical.
- Prefer GitHub Actions for build/package/release so local Node installation is optional for the user.

## Reference projects

Reference for concepts only; do not copy source code:

- BewlyCat: https://github.com/keleus/BewlyCat
- YouTubeCat: https://github.com/CCE-Li/YouTubeCat
- Bilibili-Evolved: https://github.com/the1812/Bilibili-Evolved

Useful ideas previously observed from BewlyCat include native Bilibili player DOM handling, SPA/page integration strategies, and API usage patterns. Reimplement independently.

## Next development priorities

1. Implement the YouTube-style Bilibili watch page.
2. Preserve and place the native Bilibili player in the left/main column.
3. Build the right-side related-video column.
4. Add video title, uploader, subscribe/follow state, action row, and description area.
5. Integrate comments while reusing Bilibili functionality where practical.
6. Refine homepage spacing/card proportions after testing in real Firefox.
7. Add a user-facing enable/disable or compatibility fallback if DOM replacement causes breakage after Bilibili site updates.

## Target watch-page layout

```text
+--------------------------------------------------------------+
|                            top bar                           |
+-------------------------------------------+------------------+
|                                           | related videos   |
|          Bilibili native player           | thumbnail title  |
|                                           | thumbnail title  |
+-------------------------------------------+ thumbnail title  |
| title                                     | ...              |
| uploader / follow / like / favorite ...   |                  |
| description                               |                  |
| comments                                  |                  |
+-------------------------------------------+------------------+
```

## Before starting any future development session

Always do these steps first:

1. Read the current GitHub repository state.
2. Read this `PROJECT_STATUS.md`.
3. Check the latest GitHub Actions / workflow status.
4. Check whether AMO review/publishing status has changed when relevant.
5. Only then decide what to modify; do not rely on an old chat code snapshot.

## Maintenance rule

Update this file whenever a milestone, architecture decision, publishing state, known issue, or next priority materially changes. Do not store secrets or credential values here.
