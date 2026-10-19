# BiliYouTube Project Status

Last updated: 2026-10-19

## Repository

- GitHub: https://github.com/muyg49/BiliYouTube
- Default branch: `main`
- License: GPL-3.0
- Stack: WXT + Vue 3 + TypeScript
- Firefox first; Chromium compatibility where practical

## Goal

Build a YouTube-style desktop interface for Bilibili while reusing Bilibili's native player and session/stateful controls, minimizing browser permissions, and keeping major navigation inside the BiliYouTube shell.

Do not copy source code from BewlyCat, YouTubeCat, Bilibili-Evolved, or other projects. Architecture, API usage ideas, DOM strategies, selectors, and general approaches may be studied and independently reimplemented.

## Current release state

- Source package version: `0.1.0`; release workflows override the build version at publish time.
- Firefox `0.2.0` was submitted to AMO on 2026-10-19.
- AMO validation for `0.2.0`: 0 errors, 1 warning, 0 notices.
- AMO uploaded file ID: `5137757`.
- The developer dashboard showed `0.1.0` as the listed version and `0.2.0` as the next listed version while Mozilla processing/review was pending.
- Current development target: `0.2.x` fixes from real Firefox testing.

## Implemented

### Foundation

- WXT + Vue 3 + TypeScript.
- Firefox and Chromium build targets.
- GitHub Actions CI and Firefox AMO publishing.
- End users do not need Node.js or pnpm locally.

### Homepage and shared shell

- Custom YouTube-style homepage.
- Fixed top bar, centered search, responsive sidebar, account avatar.
- Real Bilibili recommendation feed with popular-feed fallback.
- Real following/subscription list with in-place `显示更多` / `收起`.
- Responsive 16:9 video grid and infinite loading.
- System light/dark theme support.

### Internal library views

Major library navigation remains inside the BiliYouTube shell:

- History: grouped entries, filtering, search, infinite cursor loading, clear-all, pause/resume and item removal.
- Playlists: Bilibili favorite folders shown as YouTube-style playlists, detail page, search, sorting, paging, play-all and remove-from-folder.
- Watch Later: search, per-item removal, remove-viewed, clear-all, progress and play-all.
- Browser back/forward works for internal Home / History / Playlists / Watch Later routes.

### First real Firefox feedback fixes

The first installed `0.2.0` test exposed additional native-page escapes and a playlist-cover gap. The current `0.2.x` fix implements:

- Favorite-folder cover enrichment. `x/v3/fav/folder/created/list-all` does not reliably provide a cover, so BiliYouTube now reads folder metadata from `x/v3/fav/folder/info` and falls back to the first media cover from `x/v3/fav/resource/list`.
- Dynamic is now an internal BiliYouTube route (`#biliyoutube/dynamic`) instead of sending the user to `t.bilibili.com`.
- Space/channel links inside the homepage shell now open an internal BiliYouTube channel route (`#biliyoutube/channel/<mid>`), including subscription entries and author links intercepted by the shared navigation bridge.
- Internal channel pages expose Video and Dynamic tabs backed by Bilibili dynamic APIs.
- The top-right bell opens an in-place recent subscription/update popover rather than sending the user to the native Bilibili message page.
- The account avatar opens an in-place account menu with internal Channel, Dynamic, History, Playlists and Watch Later navigation rather than immediately opening native Bilibili Space.
- The new Dynamic/channel routes support browser back/forward.
- No new browser permissions were added.

The internal navigation bridge is intentionally separate from the large Vue `App.vue` shell for this iteration: it intercepts links inside the mounted BiliYouTube shadow-root UI and overlays BiliYouTube-native views without detaching Bilibili stateful modules.

### Native-first watch page

A dedicated content script targets ordinary `www.bilibili.com/video/*` pages.

Architecture rule: stateful native Bilibili modules stay mounted where Bilibili created them. BiliYouTube discovers, styles and reflows them in place instead of moving or rebuilding them.

Currently handled native regions include:

- Bilibili native player.
- Video title/info.
- UP/uploader and follow area.
- Native like/coin/favorite/share toolbar.
- Description.
- Comments container.
- Related/recommended-video column.

The video-page shell adds a YouTube-style top bar and overlay navigation drawer. Player `data-screen` changes and browser fullscreen are tracked so normal, wide, web-fullscreen and browser-fullscreen modes release layout authority to Bilibili when needed. Fullscreen modes hide BiliYouTube chrome rather than interfering with the player.

Watch-page DOM integration is fail-open: when a selector is no longer recognized, the native region is left untouched rather than removed or replaced.

## Current Bilibili API layer

- `x/web-interface/nav` — current user.
- `x/web-interface/wbi/index/top/feed/rcmd` — recommendation feed.
- `x/web-interface/popular` — recommendation fallback.
- `x/relation/followings` — subscriptions/followings.
- `x/polymer/web-dynamic/v1/feed/all` — followed Dynamic feed.
- `x/polymer/web-dynamic/v1/feed/space` — internal channel Video/Dynamic feeds.
- `x/web-interface/history/cursor` — watch history.
- `x/v2/history/shadow` / `shadow/set` — history pause state.
- `x/v2/history/clear` — clear history.
- `x/v2/history/delete` — delete history item.
- `x/v3/fav/folder/created/list-all` — favorite folders.
- `x/v3/fav/folder/info` — favorite-folder metadata/cover enrichment.
- `x/v3/fav/resource/list` — playlist contents, search, sorting, paging and preview-cover fallback.
- `x/v3/fav/resource/batch-del` — remove playlist item.
- `x/v2/history/toview` — Watch Later.
- `x/v2/history/toview/del` — Watch Later removal / remove viewed.
- `x/v2/history/toview/clear` — clear Watch Later.

Requests reuse the existing Bilibili browser session. No broad `cookies` permission is requested.

## Firefox / AMO

- Extension ID: `biliyoutube@muyg49.github.io`.
- AMO slug: `biliyoutube`.
- Initial AMO version ID: `6583128`.
- `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET` are already configured in GitHub Actions Secrets.
- Do not regenerate or revoke AMO credentials unless they are confirmed lost, invalid, or compromised.
- Minimum Firefox version: `142.0`.
- Firefox data collection declaration: `websiteContent`.

`.github/workflows/publish-firefox.yml` supports GitHub Release publishing and manual `workflow_dispatch` publishing with a version input. It sets the build version in CI, runs type checking, builds Firefox/source ZIPs and submits them to AMO.

## CI state

- `main` CI for `7df5d23e79b549e961b3a97a941b3b6aceb0b241` succeeded.
- Firefox `0.2.0` publish run `39195439137` succeeded, including AMO submission.
- The first real-Firefox navigation/playlist-cover fix is being validated through PR CI before merge.

## Architecture decisions

- BiliYouTube should increasingly behave as a small SPA shell rather than redirecting major navigation to Bilibili-native pages.
- Internal views preserve the shared BiliYouTube top bar/sidebar and load Bilibili data through APIs where practical.
- Bilibili favorite folders map to YouTube-style playlists while retaining Bilibili as the source of truth.
- Homepage: render BiliYouTube's own Vue interface rather than continuously fighting Bilibili homepage CSS.
- Watch page: keep the native Bilibili player and stateful controls; restyle/reflow rather than detach/reparent them.
- DOM integration must fail open when Bilibili changes selectors.
- Use real Bilibili account/content data rather than fake UI data.
- Minimize extension permissions.
- Prefer GitHub Actions for build/package/release.

## Next priorities

1. Validate the playlist-cover, internal Dynamic/channel, bell and account-menu fixes in signed-in Firefox.
2. Apply equivalent no-native-page navigation behavior consistently to the watch-page top bar/drawer where still needed.
3. Test watch-page playback, controls, wide mode, web fullscreen, browser fullscreen, like/coin/favorite/share, follow, description expansion, comments/editor/replies and related-video links.
4. Refine watch-page proportions and spacing toward YouTube desktop.
5. Refine internal library and channel/dynamic layouts from real screenshots.
6. Add an explicit user-facing compatibility fallback/disable control for future Bilibili DOM breakage.

## Before each future development session

1. Read the current GitHub repository state.
2. Read this `PROJECT_STATUS.md`.
3. Check latest GitHub Actions / workflow status.
4. Check AMO status when release/publishing is relevant.
5. Only then decide what to modify; do not rely on stale chat code snapshots.

## Maintenance rule

Update this file whenever a milestone, architecture decision, publishing state, known issue, or next priority materially changes. Do not store secrets or credential values here.
