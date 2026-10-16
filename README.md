# BiliYouTube

A Firefox-first browser extension that gives Bilibili a YouTube-style desktop interface while continuing to use Bilibili's own content, account session and native video pages.

## Goals

- YouTube-like 56 px top bar with centered search.
- Fixed 240 px navigation sidebar, collapsing to 72 px on narrower screens.
- Real Bilibili following list in the sidebar.
- Responsive 4/5-column recommendation feed with channel avatars and metadata.
- Keep Bilibili's native player instead of reimplementing playback.
- Later: a YouTube-style video page with the native Bilibili player on the left and recommendations on the right.
- Firefox and Chromium from the same codebase.

## Current status

`v0.1` is an early MVP. The custom interface currently replaces the Bilibili homepage. It loads the signed-in user, following list and recommendation feed through Bilibili's web APIs, with the popular feed as a fallback when recommendations are unavailable.

The project is an independent implementation. BewlyCat and other Bilibili extensions may be studied for compatibility ideas and page behavior, but their source code is not copied into this project.

## Development

Local development uses Node.js 22+ and pnpm because WXT and Vue are build-time tools. They are not required by the extension at runtime.

```bash
pnpm install
pnpm dev:firefox
```

For Chromium:

```bash
pnpm dev
```

Production packages:

```bash
pnpm zip:firefox
pnpm zip
```

If you do not want Node.js or pnpm installed locally, GitHub Actions builds the Firefox package automatically. Open the latest successful CI run and download the `biliyoutube-firefox-unsigned` artifact. The unsigned package is intended for testing; normal Firefox releases require Mozilla signing for permanent installation.

## Project layout

```text
app/                    Vue UI
entrypoints/background  Bilibili API bridge
entrypoints/content     Page injection and styles
lib/                    Shared helpers
types/                  Domain types
```

## Privacy and permissions

BiliYouTube does not ask for the browser `cookies` permission. Requests to Bilibili are made with the browser's existing Bilibili session. The initial extension permissions are limited to storage and Bilibili hosts required by the extension.

## License

GNU General Public License v3.0 only (`GPL-3.0-only`).
