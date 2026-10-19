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
- Firefox `0.2.0` was submitted to AMO on 2026-10-19. AMO file ID: `5137757`.
- Firefox `0.2.1` was submitted to AMO on 2026-10-19. AMO file ID: `5137794`; publish run `39197607355` succeeded.
- Firefox `0.2.2` was submitted to AMO on 2026-10-19. AMO file ID: `5137862`; publish run `39201420988` succeeded.
- Firefox `0.2.3` was submitted to AMO on 2026-10-19 after PR #7 watch playback enhancements. Validation: 0 errors, 1 warning, 0 notices. AMO file ID: `5137910`; publish run `39203885843` succeeded.
- Firefox `0.2.4` was submitted to AMO on 2026-10-19 after PR #8 watch-page fixes. Validation: 0 errors, 1 warning, 0 notices. AMO file ID: `5137942`; publish run `39205551787` succeeded.
- Firefox `0.2.5` was submitted to AMO on 2026-10-19 after PR #9 homepage/centering cleanup and PR #10 audio-path safety fix. Validation: 0 errors, 1 warning, 0 notices. AMO file ID: `5137990`; publish run `39207669577` succeeded.
- PR #11 was merged after Firefox CI passed, adding internal YouTube-style search/topic results and reinforcing persistent playback-speed memory. These changes are on `main` but have not yet been published as a new AMO version.

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
- Real following/subscription list with in-place `显示更多` / `收起` and paging through the full available following list.
- Responsive 16:9 video grid and infinite loading.
- System light/dark theme support.
- Homepage boot uses a tiny `document_start` preload layer: the native Bilibili body stays hidden while the BiliYouTube Vue shadow UI mounts, then becomes visible only after BiliYouTube is ready. A 10-second fail-open timeout prevents a blank page if mounting fails.
- Homepage search now stays inside the BiliYouTube shell using `#biliyoutube/search` routes and a YouTube-style vertical result view instead of redirecting to Bilibili's native search page.
- Homepage topic chips such as `音乐`, `游戏`, `知识`, `科技` and others now open an internal YouTube-style video grid with paging/infinite loading; `全部` returns to the recommendation feed.
- Internal search/topic routes participate in browser back/forward navigation.

### Internal subscriptions, Dynamic and channels

- `订阅 >` opens `#biliyoutube/subscriptions` instead of Dynamic.
- Subscriptions uses a YouTube-style latest-video grid plus an all-subscriptions channel list.
- Dynamic remains a separate internal social/activity route.
- Space/channel links inside the shell open `#biliyoutube/channel/<mid>`.
- Channel `视频` uses the creator upload archive with paging/infinite loading; channel `动态` remains separate.
- Upload archive uses WBI signing with a legacy endpoint fallback.
- Browser back/forward works for these internal routes.

### Internal library views

- History: grouped entries, filtering, search, infinite cursor loading, clear-all, pause/resume and item removal.
- Playlists: Bilibili favorite folders shown as YouTube-style playlists, detail page, search, sorting, paging, play-all and remove-from-folder.
- Watch Later: search, per-item removal, remove-viewed, clear-all, progress and play-all.
- Favorite-folder cover enrichment uses folder metadata and first-media fallback.

### Account and notification behavior

- Homepage and watch-page notification buttons open in-place recent-update popovers.
- Homepage and watch-page avatar buttons open in-place BiliYouTube account menus.
- Watch-page drawer navigation keeps major routes inside BiliYouTube where practical.

### Native-first watch page

A dedicated watch-page layer targets ordinary `www.bilibili.com/video/*` pages.

Architecture rule: stateful Bilibili modules stay mounted where Bilibili created them. BiliYouTube styles/reflows them in place instead of moving or rebuilding them.

Handled native regions include the player, title/info, uploader/follow area, like/coin/favorite/share toolbar, description, comments and right-side related/playlist areas.

The watch shell adds a YouTube-style top bar and overlay navigation drawer. Player wide/web-fullscreen/browser-fullscreen state releases layout authority to Bilibili and hides BiliYouTube chrome where necessary.

PR #7 added isolated playback enhancements:

- Collection/multi-part playback remembers the last selected episode and the playback position for each episode.
- Explicit user selection takes priority over automatic collection resume.
- Playback-speed memory is opt-in and applies the last explicitly selected speed to new videos.
- Loudness normalization is enabled by default.
- No additional browser permissions were added; extension storage is reused.

PR #8 fixed watch-page regressions found in signed-in Firefox testing:

- Playback settings now exist only behind the `BYT` control; they are no longer duplicated inside Bilibili's native settings menu.
- `BYT` is positioned immediately to the right of Bilibili's native settings gear rather than at the end of the control bar.
- Hovering `BYT` opens the BiliYouTube playback panel; moving away closes it after a short delay, while clicking can pin/unpin it.
- The right-side related-video cards keep Bilibili's native internal geometry so title/uploader/metadata are not clipped by BiliYouTube grid overrides.
- Watch-page ad cards/containers are hidden in-page using DOM/CSS filtering, including recognizable advertising links/badges. No request-blocking permission was added.

PR #9 removed both playlist/current-item auto-centering implementations after real-world testing showed they were unreliable and nonessential. Collection resume and per-video playback-position memory remain intact.

PR #10 fixed a Firefox audio-silence risk in the original loudness normalizer:

- The previous implementation used `createMediaElementSource(video)`, which routed Bilibili's audible `<video>` output through an extension-owned `AudioContext`. A suspended or unhealthy context could therefore leave playback running with no sound, including after pause/resume or reload.
- Loudness analysis no longer sits in the native audio path. When supported, `captureStream()` / `mozCaptureStream()` creates a copied media stream used only for analysis through a zero-gain sink.
- Native Bilibili/Firefox audio always remains direct and independent of the extension's analysis context.
- Normalization is now attenuation-only: overly loud material can be reduced, but the extension never boosts or reroutes audible playback.
- Disabling normalization, changing video elements, or invalidating the content script restores the native user-volume baseline, disconnects analysis nodes and closes the analysis `AudioContext`.
- If copied-stream analysis is unsupported, suspended or fails, normalization simply becomes unavailable; native video sound continues normally.

PR #11 reinforced playback-speed persistence:

- The opt-in speed setting and last selected speed continue to use extension `storage.local`, so they survive browser restarts.
- Explicit speed selections are captured more reliably and persisted immediately.
- The stored speed is reapplied at several native-player lifecycle points and during the initial stabilization window so a late Bilibili player reset does not silently replace it with `1x` after browser startup.
- The persistence layer shares the existing settings/storage keys and listens for storage changes, so it stays synchronized with the `BYT` playback settings panel.

Watch-page DOM/audio integration remains fail-open: unrecognized native regions and unavailable enhancement APIs are left on the native path.

## Current Bilibili API layer

- `x/web-interface/nav` — current user and WBI key material.
- `x/web-interface/wbi/index/top/feed/rcmd` — recommendation feed.
- `x/web-interface/popular` — recommendation fallback.
- `x/web-interface/search/type` — internal homepage search/topic video results.
- `x/relation/followings` — subscriptions/followings.
- `x/polymer/web-dynamic/v1/feed/all` — followed Dynamic and subscriptions/latest-video source.
- `x/polymer/web-dynamic/v1/feed/space` — per-channel Dynamic.
- `x/space/wbi/arc/search` — per-channel upload archive, WBI signed.
- `x/space/arc/search` — upload archive compatibility fallback.
- `x/web-interface/history/cursor` — history.
- `x/v2/history/shadow` / `shadow/set` — history pause state.
- `x/v2/history/clear` — clear history.
- `x/v2/history/delete` — delete history item.
- `x/v3/fav/folder/created/list-all` — favorite folders.
- `x/v3/fav/folder/info` — favorite metadata/cover enrichment.
- `x/v3/fav/resource/list` — playlist contents/search/sort/paging.
- `x/v3/fav/resource/batch-del` — playlist item removal.
- `x/v2/history/toview` — Watch Later.
- `x/v2/history/toview/del` — Watch Later removal/remove viewed.
- `x/v2/history/toview/clear` — clear Watch Later.

Requests reuse the existing Bilibili browser session. No broad `cookies` permission is requested.

## Firefox / AMO

- Extension ID: `biliyoutube@muyg49.github.io`.
- AMO slug: `biliyoutube`.
- Initial AMO version ID: `6583128`.
- `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET` are configured in GitHub Actions Secrets.
- Do not regenerate/revoke AMO credentials unless confirmed invalid, lost, or compromised.
- Minimum Firefox version: `142.0`.
- Firefox data collection declaration: `websiteContent`.
- `.github/workflows/publish-firefox.yml` supports GitHub Release and manual `workflow_dispatch`; temporary release branches may add a branch-specific push trigger when connector dispatch is unavailable.

## CI state

- PR #4, #5 and #6 passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- PR #7 initially exposed a TypeScript 5.9 Web Audio typed-array compatibility issue; the fix passed run `39203590105` before merge.
- Main run `39203689695` passed before the Firefox `0.2.3` release.
- Firefox `0.2.3` publish run `39203885843` succeeded, including AMO submission.
- PR #8 final CI run `39205082017` passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- Main run `39205177242` passed after PR #8 and status-document updates.
- Firefox `0.2.4` publish run `39205551787` succeeded, including AMO submission and validation with 0 errors.
- PR #9 first CI run `39206632670` caught an `HTMLBodyElement` typing mismatch in the new homepage boot helper; after correction, run `39206677575` passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- PR #10 CI run `39207551111` passed TypeScript compilation, Firefox packaging and artifact upload before merge.
- Main run `39207605799` passed after the PR #10 audio-path fix.
- Firefox `0.2.5` publish run `39207669577` succeeded, including AMO submission and validation with 0 errors.
- PR #11 initially exposed TypeScript issues in the new route guard/storage-change typing; final run `39265788243` passed TypeScript compilation, Firefox packaging and artifact upload before squash merge.

## Architecture decisions

- BiliYouTube should increasingly behave as a small SPA shell rather than redirecting major navigation to Bilibili-native pages.
- Homepage search and topic/category navigation should remain inside the BiliYouTube shell rather than opening Bilibili's native search UI.
- Subscriptions and Dynamic are separate concepts.
- Internal channel Video pages use the creator upload archive rather than infer uploads from Dynamic entries.
- Bilibili favorite folders map to YouTube-style playlists while retaining Bilibili as the source of truth.
- Homepage renders BiliYouTube's own Vue interface and should prevent the native homepage from painting before the custom shell is mounted.
- Watch page keeps the native Bilibili player and stateful controls and restyles/reflows them in place.
- Playback/UI enhancements remain isolated from the main watch-page chrome/reflow script and degrade independently.
- Playback enhancements must never make an extension-owned `AudioContext` part of the native player's required audible output path; optional audio analysis must fail open.
- DOM integration must fail open when Bilibili changes selectors.
- Use real Bilibili account/content data rather than fake UI data.
- Minimize extension permissions; watch-page ad hiding currently uses DOM/CSS rather than network interception.
- Prefer GitHub Actions for build/package/release.

## Next priorities

1. Validate Firefox `0.2.5` plus current `main` in signed-in Firefox with repeated pause/resume, video switching, reloads and fullscreen transitions; confirm native audio remains reliable with loudness normalization both enabled and disabled.
2. Validate playback-speed memory across a full browser restart and confirm Bilibili's player initialization no longer resets the persisted speed to `1x`.
3. Validate internal search and every homepage topic chip in signed-in Firefox, including back/forward, infinite loading, video links and channel links, and confirm none escape to Bilibili's native search UI.
4. Validate the no-flash homepage boot included in `0.2.5` and confirm the native Bilibili homepage no longer paints before BiliYouTube appears.
5. Verify collection resume and per-episode playback-position restore across real collection variants after removal of centering code.
6. Continue testing watch-page controls, wide/web/browser fullscreen, toolbar actions, follow, description, comments and related-video navigation.
7. Continue refining subscriptions/channel proportions and eliminating remaining native-page escapes.
8. Add an explicit user-facing compatibility fallback/disable control for future Bilibili DOM changes.

## Before each future development session

1. Read the current GitHub repository state.
2. Read this `PROJECT_STATUS.md`.
3. Check latest GitHub Actions / workflow status.
4. Check AMO status when release/publishing is relevant.
5. Only then decide what to modify; do not rely on stale chat code snapshots.

## Maintenance rule

Update this file whenever a milestone, architecture decision, publishing state, known issue, or next priority materially changes. Do not store secrets or credential values here.
