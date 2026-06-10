#!/usr/bin/env node
// Recover the local build inputs from the published (encrypted) artifacts —
// the inverse of build.js. Use this to refresh a machine's app.src.html after
// pulling, so local edits always start from what's actually deployed.
//
//   IRON_LEDGER_PASSWORD='…' node extract.js
//
// Writes app.src.html and _cookbook.pdf (both gitignored).
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const { webcrypto: crypto } = require('crypto');

const ITER = 600000;

(async () => {
  const pw = process.env.IRON_LEDGER_PASSWORD;
  if (!pw) { console.error('Set IRON_LEDGER_PASSWORD'); process.exit(1); }
  const m = fs.readFileSync('index.html', 'utf8').match(/const PAYLOAD = "([A-Za-z0-9+/=]+)"/);
  if (!m) { console.error('No payload found in index.html'); process.exit(1); }
  const data = Buffer.from(m[1], 'base64');
  const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: data.slice(0, 16), iterations: ITER, hash: 'SHA-256' }, mat,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(16, 28) }, key, data.slice(28));
  fs.writeFileSync('app.src.html', zlib.gunzipSync(Buffer.from(plain)));
  console.log('app.src.html written');

  if (fs.existsSync('cookbook.enc')) {
    const cb = fs.readFileSync('cookbook.enc');
    const pdf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cb.slice(16, 28) }, key, cb.slice(28));
    fs.writeFileSync('_cookbook.pdf', Buffer.from(pdf));
    console.log('_cookbook.pdf written');
  }
})().catch(e => { console.error('Decryption failed — wrong password?', e.message); process.exit(1); });
