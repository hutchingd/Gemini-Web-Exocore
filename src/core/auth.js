import axios from 'axios';
import {
  COOKIE_1PSID, COOKIE_1PSIDTS, COOKIE_REFRESH_COOLDOWN,
  EMAIL_PATTERN, Endpoint, GEMINI_HEADERS, ROTATE_COOKIES_BODY,
  ROTATE_COOKIES_HEADERS, TOKEN_PATTERNS,
} from './constants.js';
import { AuthError } from './exceptions.js';
import { CookieJar } from '../util/cookieJar.js';
import { logger } from '../../../@exocore/multi/dist/index.js';

export class AuthTokens {
  constructor(snlm0e = '', cfb2h = '', fdrfje = '') {
    this.snlm0e = snlm0e;
    this.cfb2h  = cfb2h;
    this.fdrfje = fdrfje;
  }
}

export class AuthState {
  constructor({ cookies = {}, tokens = new AuthTokens(), chromeProfilePath = null, lastRefreshed = 0, email = '' } = {}) {
    this.cookies = cookies;
    this.tokens  = tokens;
    this.chromeProfilePath = chromeProfilePath;
    this.lastRefreshed = lastRefreshed;
    this.email = email;
  }

  toDict() {
    const d = {
      cookies: this.cookies,
      tokens: { snlm0e: this.tokens.snlm0e, cfb2h: this.tokens.cfb2h, fdrfje: this.tokens.fdrfje },
      chrome_profile_path: this.chromeProfilePath,
      last_refreshed: this.lastRefreshed,
    };
    if (this.email) d.email = this.email;
    return d;
  }

  static fromDict(data) {
    const tokensData = data.tokens ?? {};
    return new AuthState({
      cookies:           data.cookies ?? {},
      tokens:            new AuthTokens(tokensData.snlm0e ?? '', tokensData.cfb2h ?? '', tokensData.fdrfje ?? ''),
      chromeProfilePath: data.chrome_profile_path ?? null,
      lastRefreshed:     data.last_refreshed ?? 0,
      email:             data.email ?? '',
    });
  }

  get isValid() { return Boolean(this.cookies[COOKIE_1PSID] && this.tokens.snlm0e); }
}

export function extractTokens(html) {
  const tokens = new AuthTokens();
  for (const [name, pattern] of Object.entries(TOKEN_PATTERNS)) {
    const m = html.match(pattern);
    if (m) tokens[name] = m[1];
  }
  if (!tokens.snlm0e) {
    throw new AuthError(
      'Failed to extract SNlM0e access token from Gemini page. Cookies may be expired or invalid.'
    );
  }
  return tokens;
}

export function extractEmail(html) {
  const m = html.match(EMAIL_PATTERN);
  return m ? m[1] : '';
}

export async function fetchTokens(cookies, proxy = null) {
  const jar = new CookieJar(cookies);
  const client = axios.create({
    timeout: 30_000,
    headers: { ...GEMINI_HEADERS },
    maxRedirects: 5,
    proxy: proxy ? parseAxiosProxy(proxy) : false,
    validateStatus: () => true,
  });
  jar.attachTo(client);

  const res = await client.get(Endpoint.INIT);
  if (res.status >= 400) throw new AuthError(`Gemini init page returned ${res.status} — cookies may be invalid.`);

  const html = String(res.data ?? '');
  return { tokens: extractTokens(html), cookies: jar.toObject(), email: extractEmail(html) };
}

export async function rotateCookies(cookies, proxy = null) {
  const jar = new CookieJar(cookies);
  const client = axios.create({
    timeout: 30_000,
    headers: { ...ROTATE_COOKIES_HEADERS },
    proxy: proxy ? parseAxiosProxy(proxy) : false,
    validateStatus: () => true,
  });
  jar.attachTo(client);

  const res = await client.post(Endpoint.ROTATE_COOKIES, ROTATE_COOKIES_BODY);
  if (res.status === 401) throw new AuthError('Cookie rotation returned 401. Full re-authentication required.');
  if (res.status >= 400) throw new AuthError(`Cookie rotation failed: HTTP ${res.status}`);

  const updated = jar.toObject();
  if (updated[COOKIE_1PSIDTS] && updated[COOKIE_1PSIDTS] !== cookies[COOKIE_1PSIDTS]) return updated;
  return null;
}

function parseAxiosProxy(proxy) {
  try {
    const u = new URL(proxy);
    const port = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80);
    const out = { protocol: u.protocol.replace(':', ''), host: u.hostname, port };
    if (u.username) out.auth = { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password ?? '') };
    return out;
  } catch { return false; }
}

export class AuthManager {
  #state = null;

  constructor(profileManager, profileName = null, proxy = null) {
    this.profileManager = profileManager;
    this.profileName    = profileName;
    this.proxy          = proxy;
  }

  get state() {
    if (!this.#state) throw new AuthError('AuthManager not initialized. Call load() first.');
    return this.#state;
  }

  load() {
    const data = this.profileManager.loadAuth(this.profileName ?? undefined);
    this.#state = data && Object.keys(data).length > 0 ? AuthState.fromDict(data) : new AuthState();
    return this.#state;
  }

  save() {
    if (this.#state) this.profileManager.saveAuth(this.#state.toDict(), this.profileName ?? undefined);
  }

  async refreshTokens() {
    if (!this.state.cookies[COOKIE_1PSID] && !this.state.cookies['__Secure-3PSID'])
      throw new AuthError('No cookies available. Provide cookies first.');

    logger.debug('auth: refreshing tokens from Gemini app page…');
    const { tokens, cookies, email } = await fetchTokens(this.state.cookies, this.proxy);
    this.state.tokens = tokens;
    if (email) this.state.email = email;
    for (const [k, v] of Object.entries(cookies)) this.state.cookies[k] = v;
    this.state.lastRefreshed = Date.now() / 1000;
    this.save();
    logger.debug('auth: tokens refreshed.');
    return tokens;
  }

  async refreshCookies() {
    const elapsed = Date.now() / 1000 - this.state.lastRefreshed;
    if (elapsed < COOKIE_REFRESH_COOLDOWN) {
      logger.debug(`auth: cookie-refresh cooldown ${Math.round(COOKIE_REFRESH_COOLDOWN - elapsed)}s remaining`);
      return false;
    }
    try {
      const updated = await rotateCookies(this.state.cookies, this.proxy);
      if (updated) {
        this.state.cookies = updated;
        this.state.lastRefreshed = Date.now() / 1000;
        this.save();
        logger.debug('auth: cookies refreshed via RotateCookies.');
        return true;
      }
    } catch (err) {
      if (err instanceof AuthError) { logger.warn('auth: cookie rotation failed (401). Full re-auth needed.'); throw err; }
      logger.warn(`auth: cookie rotation failed: ${err.message}`);
    }
    return false;
  }

  async recover() {
    try { await this.refreshTokens(); if (this.state.isValid) return this.state; } catch { logger.debug('auth: layer 1 (token refresh) failed.'); }
    try { this.load(); if (this.state.isValid) { logger.debug('auth: layer 2 (disk reload) succeeded.'); return this.state; } } catch { logger.debug('auth: layer 2 (disk reload) failed.'); }
    throw new AuthError('All recovery layers exhausted. Re-paste your Gemini cookies via POST /api/gemini/cookies.');
  }

  saveCookies(cookies) {
    if (!this.#state) this.#state = new AuthState();
    this.#state.cookies = { ...cookies };
    this.#state.lastRefreshed = Date.now() / 1000;
    this.save();
  }
}
