#!/usr/bin/env node
// Build the encrypted Iron Ledger bundle.
//
//   IRON_LEDGER_PASSWORD='…' node build.js [--new-salt]
//
// Inputs (local-only, gitignored — never commit these):
//   app.src.html     the real app, plaintext
//   _cookbook.pdf    recipe book PDF (optional; cookbook.enc is left alone if absent)
// Committed inputs:
//   loader.html      lock-screen template with __PAYLOAD__ / __ITER__ placeholders
// Outputs (safe to publish — everything sensitive is AES-256-GCM encrypted):
//   index.html       loader + encrypted gzipped app
//   cookbook.enc     encrypted PDF, fetched + decrypted by the app on demand
//
// The PBKDF2 salt is reused from the existing index.html so that devices that
// remembered their unlock key keep working across rebuilds. Pass --new-salt to
// rotate it (e.g. after a password change) — remembered devices will need to
// re-enter the password once.
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const { webcrypto: crypto } = require('crypto');

const ITER = 600000;

async function deriveKey(pw, salt, usages) {
  const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, mat,
    { name: 'AES-GCM', length: 256 }, false, usages);
}

async function encrypt(encKey, salt, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, bytes));
  return Buffer.concat([Buffer.from(salt), Buffer.from(iv), Buffer.from(ct)]);
}

function existingSalt() {
  try {
    const m = fs.readFileSync('index.html', 'utf8').match(/const PAYLOAD = "([A-Za-z0-9+/=]{24,})"/);
    if (m) return new Uint8Array(Buffer.from(m[1], 'base64').slice(0, 16));
  } catch (e) {}
  return null;
}

(async () => {
  const pw = process.env.IRON_LEDGER_PASSWORD;
  if (!pw) { console.error('Set IRON_LEDGER_PASSWORD'); process.exit(1); }
  if (!fs.existsSync('app.src.html')) { console.error('app.src.html not found'); process.exit(1); }

  const salt = (!process.argv.includes('--new-salt') && existingSalt()) || crypto.getRandomValues(new Uint8Array(16));
  const encKey = await deriveKey(pw, salt, ['encrypt']);
  const decKey = await deriveKey(pw, salt, ['decrypt']);

  // App payload: gzip, then encrypt.
  const src = fs.readFileSync('app.src.html');
  const packed = await encrypt(encKey, salt, zlib.gzipSync(src, { level: 9 }));

  // Round-trip sanity check before touching index.html.
  {
    const iv = packed.slice(16, 28), ct = packed.slice(28);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, decKey, ct);
    if (!zlib.gunzipSync(Buffer.from(plain)).equals(src)) { console.error('round-trip mismatch'); process.exit(1); }
  }

  const loader = fs.readFileSync('loader.html', 'utf8');
  if (!loader.includes('"__PAYLOAD__"')) { console.error('loader.html missing __PAYLOAD__ placeholder'); process.exit(1); }
  const out = loader
    .replace('"__PAYLOAD__"', JSON.stringify(packed.toString('base64')))
    .replace('__ITER__', String(ITER));
  fs.writeFileSync('index.html', out);
  console.log(`index.html  ${(out.length / 1024).toFixed(0)} KB  (app source ${(src.length / 1024).toFixed(0)} KB)`);

  // Cookbook PDF: same salt → the unlock key opens it too; its own random IV.
  if (fs.existsSync('_cookbook.pdf')) {
    const pdf = fs.readFileSync('_cookbook.pdf');
    fs.writeFileSync('cookbook.enc', await encrypt(encKey, salt, pdf));
    console.log(`cookbook.enc  ${(pdf.length / 1024).toFixed(0)} KB PDF encrypted`);
  } else {
    console.log('cookbook.enc  skipped (_cookbook.pdf not present)');
  }
})();
