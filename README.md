# Iron Ledger

A single-file, password-encrypted personal fitness PWA: workout logging with
auto-progression, meal planning + macro tracking, shopping lists, and body
composition tracking. Works fully offline once installed.

## What's in this repo

Everything published here is either public or AES-256-GCM encrypted:

| File | What it is |
| --- | --- |
| `index.html` | Lock screen + the encrypted, gzipped app payload |
| `cookbook.enc` | The recipe book PDF, encrypted with the same key |
| `sw.js` | Service worker — caches the (encrypted) app for offline use |
| `manifest.json`, `icon-*.png` | PWA install metadata |
| `loader.html` | Template for the lock screen (no secrets; placeholders filled by the build) |
| `build.js` | Build script (no secrets; password comes from the environment) |
| `extract.js` | Inverse of the build — regenerates local `app.src.html` + `_cookbook.pdf` from the published files |

The plaintext app source (`app.src.html`) and the unencrypted cookbook PDF
(`_cookbook.pdf`) live **only on the machine that builds** and are gitignored.

## Building

```sh
IRON_LEDGER_PASSWORD='…' node build.js
```

On a machine without the plaintext sources, run
`IRON_LEDGER_PASSWORD='…' node extract.js` first to recover them from the
published files. The build gzips and encrypts `app.src.html` into `index.html`, and (if
`_cookbook.pdf` is present) encrypts it into `cookbook.enc`. The PBKDF2 salt is
reused across builds so devices that chose "Remember on this device" keep their
stored unlock key; pass `--new-salt` to rotate it (e.g. after changing the
password), which signs every remembered device out once.

## Security model

- The payload is AES-256-GCM, key derived with PBKDF2-SHA256 (600k iterations).
  The password protects the app's *contents* (program, recipes) at rest on
  GitHub — it is never sent anywhere.
- "Remember on this device" stores a **non-extractable WebCrypto key** in
  IndexedDB — never the password. It can decrypt the app on that device but its
  bytes cannot be read back out.
- All workout/nutrition data stays in the browser (localStorage + daily
  IndexedDB snapshots kept 14 days, restorable from Track → Your Data).
