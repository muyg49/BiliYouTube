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
- Latest Firefox AMO release: `0.2.7`, submitted 2026-10-19. AMO file ID: `5139772`; publish run `39269112547` succeeded with 0 errors, 1 warning, 0 notices.
- Earlier AMO releases on 2026-10-19: `0.2.0` through `0.2.6`.
- `main` currently contains unreleased changes after `0.2.7`: PR #13 homepage sidebar/topic-search fixes and PR #14 playback-speed/loudness rework.

## Implemented

### Foundation

- WXT + Vue 3 + TypeScript.
- Firefox and Chromium build targets.
- GitHub Actions CI and Firefox AMO publishing.
- End users do not need Node.js or pnpm locally.
- Homepage boot uses `document_start` hiding so the native Bilibili homepage does not flash before the BiliYouTube shell mounts; a fail-open timeout prevents permanent blank pages.

### Homepage and shared shell

- Custom YouTube-style homepage with fixed top bar, centered search, responsive sidebar, account avatar and real Bilibili recommendation data.
- Hamburger menu now behaves like YouTube: expanded desktop sidebar can collapse to a compact rail and be expanded again.
- Real following/subscription list with `显示更多` / `收起` and paging through available followings.
- Responsive 16:9 recommendation grid with infinite loading.
- Internal search and topic/category navigation stay inside BiliYouTube instead of opening Bilibili's native search UI.
- Topic chips (`音乐`, `游戏`, `知识`, `科技`, `影视`, `动画`, `生活`, `美食`, `数码`, `汽车`) keep the same row and position while switching; only the active chip state changes.
- Topic/search requests use Bilibili's WBI search endpoint with signed queries.
- Topic/search page results are cached in memory for 10 minutes; identical in-flight requests are coalesced, stale cached data can be reused during transient failures, and hovering a topic chip prefetches its first page.
- A guarded retry is used for transient HTTP 412 search rejection after refreshing the main-site session context.
- Internal search/topic routes support browser back/forward.
- Homepage thumbnails keep stable rounded corners on hover.
- Homepage cards provide delayed muted moving previews using Bilibili playback streams and release preview media when hover ends.
- Three-dot card menu is functional and YouTube-like: Watch Later, save to Bilibili favorite folder, copy video link, session-only `不感兴趣`, and session-only `不推荐此频道`.
- Watch Later/favorite actions reuse the current Bilibili session and CSRF token without broad cookie permissions.

### Internal subscriptions, Dynamic and channels

- `订阅 >` opens an internal subscriptions view rather than Dynamic.
- Subscriptions uses a YouTube-style latest-video grid plus all-subscriptions channel list.
- Dynamic remains a separate internal social/activity route.
- Space/channel links inside the shell use internal channel routes.
- Channel `视频` uses the creator upload archive with WBI signing and legacy fallback; channel `动态` remains separate.
- Browser back/forward works for internal routes.

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

Architecture rule: stateful Bilibili modules stay mounted where Bilibili created them. BiliYouTube styles/reflows them in place instead of rebuilding the player.

Handled native regions include the player, title/info, uploader/follow area, like/coin/favorite/share toolbar, description, comments and right-side related/playlist areas.

The watch shell adds a YouTube-style top bar and overlay navigation drawer. The hamburger button is a true toggle; clicking it again closes the drawer. Player wide/web-fullscreen/browser-fullscreen state releases layout authority to Bilibili where necessary.

Playback enhancements:

- Collection/multi-part playback remembers the last selected episode and per-episode playback position.
- Explicit user selection takes priority over automatic collection resume.
- Playback-speed memory is opt-in and uses extension `storage.local`.
- Speed persistence now has one authoritative controller only. When enabled, the stored speed remains authoritative for the full watch-page lifetime rather than only during startup.
- Deliberate speed changes through Bilibili's native speed controls are persisted; non-user resets caused by player rebuilds, quality changes, part changes, pause/resume or SPA navigation are restored to the remembered value.
- The controller writes both `playbackRate` and `defaultPlaybackRate`, restores at player lifecycle events, and performs a lightweight periodic guard so a late reset to `1x` does not stick.
- The former duplicate speed-save path in the general playback enhancement script was removed to prevent accidental overwriting of the remembered speed.
- Loudness normalization is enabled by default.
- Loudness normalization no longer changes `HTMLMediaElement.volume`.
- When enabled, the media audio is routed through a Web Audio processing chain with adaptive gain followed by peak compression. Programme level is estimated continuously from the audio signal and gain can move both up and down toward a stable target.
- The current implementation is dynamic RMS-based loudness leveling with peak compression, not an offline EBU R128/BS.1770 scanner.
- When loudness normalization is disabled, the processing graph is bypassed at unity gain rather than changing the player's own volume setting.
- BYT playback settings remain behind the `BYT` control next to Bilibili's native settings gear; hover opens the panel and click pins/unpins it.
- Watch-page ad cards/containers are hidden with DOM/CSS filtering; no request-blocking permission is added.

## Current Bilibili API layer

- `x/web-interface/nav` — current user and WBI key material.
- `x/web-interface/wbi/index/top/feed/rcmd` — recommendation feed.
- `x/web-interface/popular` — recommendation fallback.
- `x/web-interface/wbi/search/type` — signed internal homepage search/topic video results.
- `x/web-interface/view` — video aid/cid metadata used by homepage preview and favorite actions.
- `x/player/playurl` — low-resolution homepage hover preview stream lookup.
- `x/relation/followings` — subscriptions/followings.
- `x/polymer/web-dynamic/v1/feed/all` — followed Dynamic and subscriptions/latest-video source.
- `x/polymer/web-dynamic/v1/feed/space` — per-channel Dynamic.
- `x/space/wbi/arc/search` — per-channel upload archive, WBI signed.
- `x/space/arc/search` — upload archive compatibility fallback.
- `x/web-interface/history/cursor` — history.
- `x/v2/history/shadow` / `shadow/set` — history pause state.
- `x/v2/history/clear` — clear history.
- `x/v2/history/delete` — delete history item.
- `x/v3/fav/folder/created/list-all` — favorite folders and homepage save-to-playlist picker.
- `x/v3/fav/folder/info` — favorite metadata/cover enrichment.
- `x/v3/fav/resource/list` — playlist contents/search/sort/paging.
- `x/v3/fav/resource/deal` — add a homepage video to a selected Bilibili favorite folder.
- `x/v3/fav/resource/batch-del` — playlist item removal.
- `x/v2/history/toview` — Watch Later.
- `x/v2/history/toview/add` — homepage add-to-Watch-Later action.
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

- Firefox `0.2.7` publish run `39269112547` succeeded, including AMO submission and validation with 0 errors.
- PR #13 (`Fix homepage sidebar toggle and stabilize topic switching`) passed run `39271783259`; merged as `9a5a971a62e1beca0fe6f1c232fd153a1f767ce4`. Main run `39271873640` passed.
- PR #14 (`Make speed memory authoritative and implement real loudness leveling`) passed run `39272737660`; merged as `60b7023bef1f656c8b79fa896ae0bbc8e9bd765d`. Main run `39272814389` passed.

## Architecture decisions

- BiliYouTube should increasingly behave as a small SPA shell rather than redirecting major navigation to Bilibili-native pages.
- Homepage search and category navigation remain inside the BiliYouTube shell.
- Category switching should be visually stable and fast; short-lived result caching/prefetching is preferred over refetching the same page on every click.
- Homepage card interaction enhancements stay isolated from the main Vue shell where practical.
- Actions that mutate the user's Bilibili account reuse the current Bilibili session and CSRF token without adding cookie permissions.
- Subscriptions and Dynamic are separate concepts.
- Internal channel Video pages use the creator upload archive rather than infer uploads from Dynamic entries.
- Bilibili favorite folders map to YouTube-style playlists while retaining Bilibili as the source of truth.
- Watch page keeps the native Bilibili player and stateful controls and restyles/reflows them in place.
- Playback-speed persistence must have one authoritative writer/restore controller to avoid races.
- Loudness leveling should process audio gain rather than use the native player volume as an actuator.
- DOM/API integrations should fail gracefully when Bilibili changes behavior.
- Use real Bilibili account/content data rather than fake UI data.
- Minimize extension permissions.
- Prefer GitHub Actions for build/package/release.

## Next priorities

1. Validate the unreleased post-`0.2.7` main build in signed-in Firefox: collapse/expand the homepage sidebar repeatedly and verify compact-rail layout at common viewport widths.
2. Switch rapidly between all homepage topic chips, revisit previously opened topics, and verify cached/prefetched pages appear immediately without chip-row movement.
3. Confirm the WBI topic/search path avoids the observed intermittent HTTP 412 under normal signed-in browsing; verify cached fallback behavior if Bilibili temporarily rejects a request.
4. Validate playback-speed memory across full Firefox restarts, quality changes, pause/resume, multi-part videos and SPA navigation; confirm native user speed changes persist while unsolicited resets do not.
5. Compare quiet and loud videos with loudness normalization enabled and disabled; verify the BYT implementation changes signal gain without moving Bilibili's visible volume control.
6. Test mute/unmute, volume changes, seeking, pause/resume, fullscreen and video switches while the Web Audio loudness graph is active.
7. Continue testing homepage hover previews and three-dot actions in light/dark themes.
8. Continue refining subscriptions/channel proportions and eliminating remaining native-page escapes.
9. Add an explicit user-facing compatibility fallback/disable control for future Bilibili DOM/API changes.

## Before each future development session

1. Read the current GitHub repository state.
2. Read this `PROJECT_STATUS.md`.
3. Check latest GitHub Actions / workflow status.
4. Check AMO status when release/publishing is relevant.
5. Only then decide what to modify; do not rely on stale chat code snapshots.

## Maintenance rule

Update this file whenever a milestone, architecture decision, publishing state, known issue, or next priority materially changes. Do not store secrets or credential values here.
