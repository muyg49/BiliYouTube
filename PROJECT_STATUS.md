# BiliYouTube Project Status

Last updated: 2026-10-19

## Repository

- GitHub: https://github.com/muyg49/BiliYouTube
- Default branch: `main`
- License: GPL-3.0
- Stack: WXT + Vue 3 + TypeScript
- Firefox first; Chromium compatibility where practical

## Goal

Build a YouTube-style desktop interface for Bilibili while reusing Bilibili's native player and stateful controls, minimizing browser permissions, and keeping major navigation inside the BiliYouTube shell.

Do not copy source code from BewlyCat, YouTubeCat, Bilibili-Evolved, or other projects. Architecture, API usage ideas, DOM strategies, selectors, and general approaches may be studied and independently reimplemented.

## Current release state

- Source package version remains `0.1.0`; release workflows override the build version at publish time.
- Firefox `0.2.0` was submitted to AMO on 2026-10-19.
  - Validation: 0 errors, 1 warning, 0 notices.
  - AMO uploaded file ID: `5137757`.
- Firefox `0.2.1` was submitted to AMO on 2026-10-19 after the first real Firefox test fixes.
  - Validation: 0 errors, 1 warning, 0 notices.
  - AMO uploaded file ID: `5137794`.
  - Publish workflow run: `39197607355`, successful.
- Firefox `0.2.2` was submitted to AMO on 2026-10-19 after the subscriptions/channel refinement in PR #6.
  - Validation: 0 errors, 1 warning, 0 notices.
  - AMO uploaded file ID: `5137862`.
  - Publish workflow run: `39201420988`, successful.
- Firefox `0.2.3` was submitted to AMO on 2026-10-19 after the watch-page playback enhancements in PR #7.
  - Validation: 0 errors, 1 warning, 0 notices.
  - AMO uploaded file ID: `5137910`.
  - Publish workflow run: `39203885843`, successful.
- Current development target: validate Firefox `0.2.3` in signed-in real-world playback and continue `0.2.x` refinement.

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
- Following retrieval pages through the signed-in user's complete available following list so `显示更多` exposes the full list instead of only the first API page.
- Responsive 16:9 video grid and infinite loading.
- System light/dark theme support.

### Internal subscriptions, Dynamic and channels

- `订阅 >` opens a dedicated internal route (`#biliyoutube/subscriptions`) rather than Dynamic.
- The subscriptions route follows the YouTube desktop model: a `最新` video grid sourced from followed creators, with an in-place `所有订阅` channel list.
- Dynamic remains a separate internal route (`#biliyoutube/dynamic`) for social/activity posts.
- Space/channel links inside the shell open an internal channel route (`#biliyoutube/channel/<mid>`).
- Channel `视频` uses the creator's actual upload archive, paged 30 videos at a time with infinite loading and a multi-column YouTube-style grid.
- Channel `动态` remains separate and uses the creator's Dynamic feed.
- Current Bilibili upload API uses WBI signing with a legacy archive endpoint fallback for compatibility.
- Subscriptions/Dynamic/channel routes support browser back/forward.

### Internal library views

- History: grouped entries, filtering, search, infinite cursor loading, clear-all, pause/resume and item removal.
- Playlists: Bilibili favorite folders shown as YouTube-style playlists, detail page, search, sorting, paging, play-all and remove-from-folder.
- Watch Later: search, per-item removal, remove-viewed, clear-all, progress and play-all.
- Browser back/forward works for internal Home / History / Playlists / Watch Later routes.
- Favorite-folder cover enrichment uses folder metadata and falls back to the first media cover when necessary.

### Account and notification behavior

- Homepage top-right bell opens an in-place recent subscription/update popover instead of the native Bilibili message page.
- Homepage avatar opens an in-place account menu with internal Channel, subscriptions/Dynamic, History, Playlists and Watch Later navigation.
- Watch-page bell and avatar use corresponding in-place BiliYouTube popovers.
- Watch-page drawer navigation keeps Dynamic and subscription/channel routes inside BiliYouTube where practical.

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

PR #7 added an isolated playback-enhancement content script on top of the native-first watch page:

- Additional YouTube-style spacing and related-video/card proportions without replacing the native player.
- Collection/multi-part playback remembers the last selected episode and the playback position for each episode.
- Explicit user selection of another episode takes priority over automatic collection resume.
- The active collection episode is automatically centered in the scrollable episode list where the native DOM exposes a usable list.
- Playback-speed memory is an opt-in setting and applies the user's last explicitly selected speed to new videos.
- Loudness normalization is enabled by default and can be disabled from the playback settings UI. It uses a Web Audio analyser, adaptive gain and peak compression to reduce large loudness differences between videos.
- Player-setting integration prefers the native settings surface and exposes a small BiliYouTube fallback control if that surface cannot be safely extended.
- No additional browser permissions were added; existing extension storage is reused.

Watch-page DOM integration is fail-open: when a selector is no longer recognized, the native region is left untouched rather than removed or replaced.

## Current Bilibili API layer

- `x/web-interface/nav` — current user and WBI key material.
- `x/web-interface/wbi/index/top/feed/rcmd` — recommendation feed.
- `x/web-interface/popular` — recommendation fallback.
- `x/relation/followings` — subscriptions/followings, paged for the current user's full available list.
- `x/polymer/web-dynamic/v1/feed/all` — followed Dynamic feed and subscriptions/latest-video source.
- `x/polymer/web-dynamic/v1/feed/space` — per-channel Dynamic feed.
- `x/space/wbi/arc/search` — per-channel upload archive, WBI signed.
- `x/space/arc/search` — compatibility fallback for upload archive.
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
- `.github/workflows/publish-firefox.yml` supports GitHub Release publishing and manual `workflow_dispatch` publishing with a version input; release test branches may temporarily add a branch-specific push trigger when direct dispatch is unavailable from the connector.

## CI state

- PR #4 passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- PR #5 passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- PR #6 passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- PR #7 initially exposed a TypeScript 5.9 Web Audio typed-array compatibility error; the fix was committed and CI run `39203590105` then passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- Latest `main` CI before the `0.2.3` release, run `39203689695`, succeeded.
- Firefox `0.2.2` publish run `39201420988` succeeded, including AMO submission.
- Firefox `0.2.3` publish run `39203885843` succeeded, including AMO submission and validation with 0 errors.

## Architecture decisions

- BiliYouTube should increasingly behave as a small SPA shell rather than redirecting major navigation to Bilibili-native pages.
- Subscriptions and Dynamic are different concepts: Subscriptions is video-centric like YouTube's subscriptions feed; Dynamic remains Bilibili's social/activity stream.
- Internal channel Video pages must use the creator upload archive rather than infer uploads from Dynamic entries.
- Internal views preserve the shared BiliYouTube top bar/sidebar and load Bilibili data through APIs where practical.
- Bilibili favorite folders map to YouTube-style playlists while retaining Bilibili as the source of truth.
- Homepage: render BiliYouTube's own Vue interface rather than continuously fighting Bilibili homepage CSS.
- Watch page: keep the native Bilibili player and stateful controls; restyle/reflow rather than detach/reparent them.
- Playback enhancements should remain isolated from the main watch-page chrome/reflow script and degrade independently when selectors or browser media behavior change.
- DOM integration must fail open when Bilibili changes selectors.
- Use real Bilibili account/content data rather than fake UI data.
- Minimize extension permissions.
- Prefer GitHub Actions for build/package/release.

## Next priorities

1. Validate Firefox `0.2.3` watch-page changes in signed-in Firefox, especially ordinary videos, multi-P videos and collection/season pages.
2. Verify speed-memory toggling, loudness normalization, native/fallback settings UI and audio behavior across navigation, pause/resume and fullscreen modes.
3. Validate dedicated Subscriptions route, full sidebar expansion and WBI-backed channel upload archive.
4. Validate playlist covers and account/notification popovers in signed-in Firefox.
5. Test watch-page playback, controls, wide mode, web fullscreen, browser fullscreen, like/coin/favorite/share, follow, description expansion, comments/editor/replies and related-video links.
6. Refine channel header/tabs and subscriptions grid proportions from real screenshots.
7. Continue eliminating remaining native-page escapes where Bilibili has a meaningful equivalent inside the BiliYouTube shell.
8. Add an explicit user-facing compatibility fallback/disable control for future Bilibili DOM breakage.

## Before each future development session

1. Read the current GitHub repository state.
2. Read this `PROJECT_STATUS.md`.
3. Check latest GitHub Actions / workflow status.
4. Check AMO status when release/publishing is relevant.
5. Only then decide what to modify; do not rely on stale chat code snapshots.

## Maintenance rule

Update this file whenever a milestone, architecture decision, publishing state, known issue, or next priority materially changes. Do not store secrets or credential values here.
