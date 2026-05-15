import axios from 'axios';
import { GeminiClient } from './core/client.js';
import { AuthError, GeminiError } from './core/exceptions.js';
import { ConversationMetadata } from './core/models.js';
import { checkCookies, importCookiesFromRaw, clearCookiesFile, getFlatCookies } from './core/cookieManager.js';
import { uploadToContentPush, buildFileDataItem } from './core/upload.js';
import { logger } from '../../@exocore/multi/dist/index.js';

export {
  GeminiClient,
  AuthError,
  GeminiError,
  ConversationMetadata,
  checkCookies,
  importCookiesFromRaw,
  clearCookiesFile,
};

/**
 * Fetch a remote URL and upload it to Gemini's content-push endpoint.
 * Requires a pre-initialized GeminiClient passed as second argument.
 * Returns a fileData item or null on failure.
 */
export async function fetchAndUpload(url, client) {
  if (!client?.initialized) { logger.warn(`fetchAndUpload: client not ready, skipping ${url}`); return null; }
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30_000 });
    const contentType = res.headers['content-type']?.split(';')[0]?.trim() || 'application/octet-stream';
    const filename = url.split('/').pop()?.split('?')[0] || 'file';
    const buf = Buffer.from(res.data);
    const storagePath = await uploadToContentPush(null, client.getCookies(), buf, contentType, filename);
    if (!storagePath) return null;
    return buildFileDataItem(storagePath, contentType, filename);
  } catch (e) {
    logger.warn(`fetchAndUpload: failed for ${url}: ${e.message}`);
    return null;
  }
}

/**
 * Load cookies from disk and log their status.
 * Call after the server starts to confirm cookie state.
 */
export function loadIntoCookieJar() {
  const status = checkCookies();
  if (status.valid) {
    logger.info(`cookies: loaded ${status.total_cookies} cookies from disk (psid: ${status.psid?.slice(0, 10)}…)`);
  } else {
    logger.warn('cookies: no valid cookies on disk — POST /api/gemini/cookies to authenticate');
  }
  return status;
}

/**
 * Module registry — extend this object to register additional provider modules.
 * server.js logs the provider names on startup.
 */
export const modules = {
  gemini: { name: 'gemini', version: '1.0.0' },
};
