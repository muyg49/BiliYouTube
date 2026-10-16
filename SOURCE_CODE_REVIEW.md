# Firefox source-code review

BiliYouTube is built with WXT, Vue 3 and TypeScript. The repository contains the original, readable source code. No obfuscation is used.

## Reproducible build

Requirements:

- Node.js 22
- pnpm 10.18.3

Commands:

```bash
pnpm install --frozen-lockfile
pnpm zip:firefox
```

The Firefox extension archive is created at `.output/biliyoutube-<version>-firefox.zip` and the corresponding source archive at `.output/biliyoutube-<version>-sources.zip`.

All dependencies are obtained from the public npm registry through pnpm. No private build service, private package registry, or unpublished source dependency is required.
