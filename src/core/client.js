import axios from 'axios';
import { DEFAULT_MODEL, GEMINI_HEADERS, getModel } from './constants.js';
import { AuthError, GeminiError } from './exceptions.js';
import { AuthManager } from './auth.js';
import { ConversationMetadata, RPCPayload, StreamResponse } from './models.js';
import { ProfileManager } from './profiles.js';
import { RPCTransport } from './rpc.js';
import { CookieJar } from '../util/cookieJar.js';
import { logger } from '../../../@exocore/multi/dist/index.js';
import { COOKIES_JSON_PATH, LOCAL_COOKIES_PATH, discoverCookiesPath, importCookiesToProfile } from './cookieManager.js';
import * as fs from 'fs';
import { uploadToContentPush, buildFileDataItem } from './upload.js';
import { Model } from './constants.js';

export class GeminiClient {
  #httpClient = null;
  #jar        = null;
  #transport  = null;
  #initialized = false;

  constructor({ profileName = null, proxy = null, timeoutMs = 300_000 } = {}) {
    this.profileManager = new ProfileManager();
    this.authManager    = new AuthManager(this.profileManager, profileName, proxy);
    this.proxy          = proxy;
    this.timeoutMs      = timeoutMs;
  }

  get transport() {
    if (!this.#transport) throw new AuthError('Client not initialized. Call init() first.');
    return this.#transport;
  }

  get initialized() { return this.#initialized; }

  async init() {
    let authState = this.authManager.load();

    try {
      const localFound = discoverCookiesPath();
      const haveAnyCookies = fs.existsSync(COOKIES_JSON_PATH) || fs.existsSync(LOCAL_COOKIES_PATH) || localFound !== null;
      if (haveAnyCookies && importCookiesToProfile(this.authManager)) {
        authState = this.authManager.load();
        logger.info(`client: auto-synced exocoreCookies.json → profile (${Object.keys(authState.cookies).length} cookies).`);
      }
    } catch (exc) { logger.debug(`client: exocoreCookies.json auto-sync skipped: ${exc.message}`); }

    const hasPsid = !!(authState.cookies['__Secure-1PSID'] || authState.cookies['__Secure-3PSID']);
    if (hasPsid) {
      try { await this.authManager.refreshTokens(); authState = this.authManager.state; logger.info('client: fresh SSID/snlm0e fetched on boot.'); }
      catch (exc) { logger.debug(`client: boot warm-up refresh skipped: ${exc.message}`); }
    }

    if (!authState.isValid) {
      if (hasPsid) {
        logger.info('client: cookies found but no access token. Attempting token fetch…');
        try { await this.authManager.refreshTokens(); authState = this.authManager.state; logger.info('client: token fetch successful.'); }
        catch { throw new AuthError('Saved cookies look expired. Tap the login button and paste fresh cookies.'); }
      } else {
        throw new AuthError('Not signed in yet — tap the login button to paste your cookies.');
      }
    }

    if (authState.isValid) {
      try { await this.authManager.refreshTokens(); }
      catch {
        logger.debug('client: token refresh failed, attempting recovery…');
        try { await this.authManager.recover(); }
        catch { logger.warn('client: token recovery failed. Using cached tokens — some features may not work.'); }
      }
    }

    authState = this.authManager.state;

    this.#jar = new CookieJar(authState.cookies);
    this.#httpClient = axios.create({
      timeout: this.timeoutMs,
      headers: { ...GEMINI_HEADERS },
      maxRedirects: 5,
      proxy: this.proxy ? parseAxiosProxy(this.proxy) : false,
      validateStatus: () => true,
    });
    this.#jar.attachTo(this.#httpClient);

    this.#transport = new RPCTransport({
      client:      this.#httpClient,
      accessToken: authState.tokens.snlm0e,
      buildLabel:  authState.tokens.cfb2h  ?? null,
      sessionId:   authState.tokens.fdrfje ?? null,
    });

    this.#initialized = true;
    logger.info('client: GeminiClient initialized.');
  }

  async close() {
    this.#httpClient = null;
    this.#jar        = null;
    this.#transport  = null;
    this.#initialized = false;
  }

  async send(prompt, { model = null, metadata = null, fileData = null, gemId = null, toolId = null, stylePreset = null } = {}) {
    if (!this.#initialized) throw new AuthError('GeminiClient not initialized. Call init() first.');
    if (toolId !== null && toolId !== undefined) {
      throw new GeminiError('Tool-flagged requests require BotGuard and are not supported in the HTTP-only port.');
    }
    if (fileData?.length > 0) logger.warn('client: file_data provided over HTTP path — Google may return 0 candidates.');

    const resolvedModel = this.#resolveModel(model);
    return this.transport.streamGenerate({ prompt, model: resolvedModel, metadata, fileData, gemId, toolId: null, stylePreset });
  }

  async executeRpc(rpcId, payload = '[]', sourcePath = '/app') {
    return this.transport.batchexecute([new RPCPayload({ rpcId, payload })], sourcePath);
  }

  async executeRpcs(payloads, sourcePath = '/app') {
    return this.transport.batchexecute(payloads, sourcePath);
  }

  async uploadFile(content, mimeType, filename) {
    if (!this.#initialized || !this.#httpClient) return null;
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const storagePath = await uploadToContentPush(this.#httpClient, this.getCookies(), buf, mimeType, filename);
    if (!storagePath) return null;
    return buildFileDataItem(storagePath, mimeType, filename);
  }

  getCookies() {
    return this.#jar ? this.#jar.toObject() : { ...this.authManager.state.cookies };
  }

  #resolveModel(model) {
    if (model instanceof Model) return model;
    if (typeof model === 'string' && model.length > 0) return getModel(model);
    return DEFAULT_MODEL;
  }
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
