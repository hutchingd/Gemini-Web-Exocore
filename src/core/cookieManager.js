import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Permanent in-project location — lives next to this package so it survives restarts.
// src/core/ → ../../ → gemini-web/
export const COOKIES_JSON_PATH = path.resolve(__dirname, '../..', 'cookies.json');
export const LOCAL_COOKIES_PATH = COOKIES_JSON_PATH;

if (!fs.existsSync(COOKIES_JSON_PATH)) {
  fs.writeFileSync(COOKIES_JSON_PATH, '[]', 'utf-8');
}

export const AUTH_COOKIE_KEYS = [
  '__Secure-1PSID', '__Secure-1PSIDTS', '__Secure-1PSIDCC', '__Secure-1PAPISID',
  '__Secure-3PSID', '__Secure-3PSIDTS', '__Secure-3PSIDCC', '__Secure-3PAPISID',
  'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'SIDCC', 'AEC', 'NID',
  '1P_JAR', '__Secure-ENID', 'SEARCH_SAMESITE',
];

export const CRITICAL_COOKIES = ['__Secure-1PSID', '__Secure-1PSIDTS'];
export const ALT_CRITICAL      = ['__Secure-3PSID', '__Secure-3PSIDTS'];

function activePath() { return COOKIES_JSON_PATH; }

export function isCookiesFileEmpty() {
  if (!fs.existsSync(COOKIES_JSON_PATH)) return true;
  try {
    const data = JSON.parse(fs.readFileSync(COOKIES_JSON_PATH, 'utf-8'));
    if (Array.isArray(data)) return data.length === 0;
    if (data !== null && typeof data === 'object') return Object.keys(data).length === 0;
  } catch { /* ignore */ }
  return true;
}

export function parseCookies(source) {
  if (source !== null && typeof source === 'object' && !Array.isArray(source)) {
    const out = {};
    for (const [k, v] of Object.entries(source)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  if (Array.isArray(source)) {
    const result = {};
    for (const item of source) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        if (typeof item.name === 'string' && typeof item.value === 'string') {
          result[item.name] = item.value;
        }
      }
    }
    return result;
  }

  if (typeof source === 'string') {
    let s = source.trim()
      .replace(/^(var|let|const)\s+\w+\s*=\s*/, '')
      .replace(/;$/, '');

    try { return parseCookies(JSON.parse(s)); } catch { /* fall through */ }

    if (s.startsWith('{') && !s.startsWith('[')) {
      try { return parseCookies(JSON.parse(`[${s}]`)); } catch { /* fall through */ }
    }

    const result = {};
    for (const rawLine of s.split(/\r?\n/)) {
      let line = rawLine.trim().replace(/^,/, '').replace(/,$/, '')
        .replace(/^["']/, '').replace(/["']$/, '');
      if (line.includes(':')) {
        const idx = line.indexOf(':');
        let k = line.slice(0, idx).trim().replace(/^["']/, '').replace(/["']$/, '');
        let v = line.slice(idx + 1).trim().replace(/^["']/, '').replace(/["']$/, '');
        if (k && v) result[k] = v;
      } else if (line.includes('=')) {
        const idx = line.indexOf('=');
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) result[k] = v;
      }
    }
    return result;
  }

  return {};
}

export function loadCookiesJson() {
  const p = activePath();
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (Array.isArray(data)) return data;
    if (data !== null && typeof data === 'object') {
      return Object.entries(data).map(([k, v]) => ({
        name: k, value: String(v), domain: '.google.com', path: '/',
        secure: true, httpOnly: true, session: false,
      }));
    }
  } catch { /* ignore */ }
  return [];
}

export function saveCookiesJson(cookies, targetPath) {
  const target = targetPath ?? COOKIES_JSON_PATH;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let toWrite;
  if (!Array.isArray(cookies)) {
    toWrite = Object.entries(cookies).map(([k, v]) => ({
      name: k, value: v, domain: '.google.com', path: '/',
      secure: true, httpOnly: true, session: false,
    }));
  } else {
    toWrite = cookies;
  }
  fs.writeFileSync(target, JSON.stringify(toWrite, null, 2));
}

export function mergeCookies(existing, newCookies) {
  const index = {};
  for (const c of existing) { if (c.name) index[c.name] = c; }
  if (Array.isArray(newCookies)) {
    for (const item of newCookies) {
      if (item.name && item.value !== undefined) {
        if (item.name in index) Object.assign(index[item.name], item);
        else index[item.name] = item;
      }
    }
  } else {
    for (const [name, value] of Object.entries(newCookies)) {
      if (name in index) index[name].value = value;
      else index[name] = { name, value, domain: '.google.com', path: '/', secure: true, httpOnly: true, session: false };
    }
  }
  return Object.values(index);
}

export function getFlatCookies(filterAuth = true) {
  const raw = loadCookiesJson();
  const flat = parseCookies(raw);
  if (filterAuth) {
    const filtered = {};
    for (const [k, v] of Object.entries(flat)) {
      if (AUTH_COOKIE_KEYS.includes(k)) filtered[k] = v;
    }
    return filtered;
  }
  return flat;
}

export function checkCookies() {
  const flat = getFlatCookies(false);
  const p = activePath();
  const results = {};
  for (const key of CRITICAL_COOKIES) {
    const val = flat[key] ?? '';
    results[key] = { present: !!val, value_preview: val.length > 28 ? val.slice(0, 28) + '...' : val };
  }
  const altResults = {};
  for (const key of ALT_CRITICAL) {
    const val = flat[key] ?? '';
    altResults[key] = { present: !!val, value_preview: val.length > 28 ? val.slice(0, 28) + '...' : val };
  }
  const otherFound = AUTH_COOKIE_KEYS.filter(
    k => !CRITICAL_COOKIES.includes(k) && !ALT_CRITICAL.includes(k) && k in flat
  );
  const primaryValid = Object.values(results).every(r => r.present);
  const altValid     = Object.values(altResults).every(r => r.present);
  return {
    critical: results, alt: altResults, other_auth_found: otherFound,
    total_cookies: Object.keys(flat).length,
    valid: primaryValid || altValid,
    psid: flat['__Secure-1PSID'] || flat['__Secure-3PSID'] || '',
    path: p,
    jar_size: Object.keys(flat).length,
  };
}

export function importCookiesFromRaw(rawText) {
  const parsed = parseCookies(rawText);
  if (Object.keys(parsed).length === 0)
    return { ok: false, error: 'Could not parse any cookies from input' };
  const psid   = parsed['__Secure-1PSID'] || parsed['__Secure-3PSID'] || parsed.SID || '';
  const psidts = parsed['__Secure-1PSIDTS'] || parsed['__Secure-3PSIDTS'] || '';
  const existing = loadCookiesJson();
  const merged = mergeCookies(existing, parsed);
  saveCookiesJson(merged);
  return {
    ok: true,
    psid_found:  !!psid,
    psidts_found: !!psidts,
    total: Object.keys(parsed).length,
    path: COOKIES_JSON_PATH,
    preview: psid ? psid.slice(0, 20) + '...' : '(not found)',
  };
}

export function getCookiesPath() { return activePath(); }

export function clearCookiesFile() {
  const p = activePath();
  if (!fs.existsSync(p)) return { ok: true, path: p, message: 'No cookies file found — nothing to delete.' };
  fs.writeFileSync(p, '[]', 'utf-8');
  return { ok: true, path: p, message: 'Cookies cleared.' };
}

export function discoverCookiesPath() {
  return fs.existsSync(COOKIES_JSON_PATH) ? COOKIES_JSON_PATH : null;
}

export function importCookiesToProfile(auth) {
  const flat = getFlatCookies(true);
  if (Object.keys(flat).length === 0) return false;
  auth.saveCookies(flat);
  return true;
}
