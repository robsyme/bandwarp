---
id: 010
title: Create the GitHub repo and Pages hosting
labels: [wayfinder:task]
status: closed
assignee: robsyme
blocked-by: []
---

## Question

Provision the delivery path decided in [What tech stack and distribution for the client-side tool?](007-tech-stack-and-distribution.md): create the GitHub repository (name and owner to be confirmed with the user — personal vs org), push the existing local history, and enable GitHub Pages (deploy-from-actions or from a `dist` branch, whichever the build charting settles on). Resolution records the repo URL and the Pages URL the scientist will bookmark. The example plate photos are part of the repo (they are the test fixtures); confirm the user is comfortable with them being public, or make the repo private with Pages visibility to match.

## Resolution

Done (2026-08-20), user-confirmed choices: **public**, personal account, named per the naming discussion.

- Repo: https://github.com/robsyme/bandwarp (public; example photos included as fixtures, user approved). Full local history pushed; `package.json` renamed to `bandwarp`.
- Pages: https://robsyme.github.io/bandwarp/ — deploy-from-actions (`.github/workflows/pages.yml`: npm ci → test → build → deploy `dist/`), first deployment green and serving HTTP 200. Every push to `main` now tests and redeploys.
- The single-file build means no vite `base` config is needed for the `/bandwarp/` subpath — all assets are inlined.
- Currently serving the ticket-012 dev harness; the real app replaces it as the build chain lands. The scientist's bookmark URL is final.
