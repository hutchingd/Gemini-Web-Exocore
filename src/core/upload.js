import axios from 'axios';
import { logger } from '../../../@exocore/multi/dist/index.js';

const UPLOAD_ENDPOINT = 'https://push.clients6.google.com/upload/';
const PUSH_ID         = 'feeds/mcudyrk2a4khkz';
const X_TENANT_ID     = 'bard-storage';
const X_CLIENT_DATA   = 'CJvoygE=';
const X_CLIENT_PCTX   = 'CgcSBWjK7pYx';

function formatCookieHeader(cookies) {
  return Object.entries(cookies)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function makeUploadClient() {
  return axios.create({ timeout: 60_000, maxRedirects: 5, validateStatus: () => true });
}

export async function uploadToContentPush(_client, cookies, content, mimeType, filename) {
  const cookieHeader = formatCookieHeader(cookies);
  if (!cookieHeader) { logger.warn('upload: no cookies available — cannot authenticate upload'); return null; }

  const http = makeUploadClient();

  const step1Headers = {
    'accept': '*/*',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'push-id': PUSH_ID,
    'x-goog-upload-command': 'start',
    'x-goog-upload-protocol': 'resumable',
    'x-goog-upload-header-content-length': content.length.toString(),
    'x-tenant-id': X_TENANT_ID,
    'x-client-data': X_CLIENT_DATA,
    'x-client-pctx': X_CLIENT_PCTX,
    'cookie': cookieHeader,
    'origin': 'https://gemini.google.com',
    'referer': 'https://gemini.google.com/',
  };

  let uploadUrl;
  try {
    logger.debug(`upload: step1 start — size=${content.length} mime=${mimeType} file=${filename}`);
    const r1 = await http.post(UPLOAD_ENDPOINT, `File name: ${filename}`, { headers: step1Headers, responseType: 'text', maxRedirects: 0 });
    if (r1.status !== 200) { logger.warn(`upload: step1 failed status=${r1.status} body="${String(r1.data).slice(0, 200)}"`); return null; }
    uploadUrl = r1.headers['x-goog-upload-url'] ?? '';
    if (!uploadUrl) { logger.warn(`upload: step1 OK but no x-goog-upload-url header.`); return null; }
    logger.debug(`upload: step1 OK — upload_url=${uploadUrl.slice(0, 80)}…`);
  } catch (e) { logger.warn(`upload: step1 threw: ${e.message}`); return null; }

  const step2Headers = {
    'accept': '*/*',
    'content-type': mimeType,
    'push-id': PUSH_ID,
    'x-goog-upload-command': 'upload, finalize',
    'x-goog-upload-offset': '0',
    'x-tenant-id': X_TENANT_ID,
    'x-client-data': X_CLIENT_DATA,
    'x-client-pctx': X_CLIENT_PCTX,
    'cookie': cookieHeader,
    'origin': 'https://gemini.google.com',
    'referer': 'https://gemini.google.com/',
  };

  try {
    logger.debug(`upload: step2 upload,finalize — url=${uploadUrl.slice(0, 80)}…`);
    const r2 = await http.post(uploadUrl, content, { headers: step2Headers, responseType: 'text', maxRedirects: 5 });
    const body = (r2.data ?? '');
    logger.debug(`upload: step2 status=${r2.status} body="${body.slice(0, 120)}"`);
    if (r2.status === 200 && body.trim().startsWith('/')) { logger.info(`upload: success → ${body.trim().slice(0, 80)}`); return body.trim(); }
    logger.warn(`upload: step2 failed status=${r2.status} body="${body.slice(0, 200)}"`);
    return null;
  } catch (e) { logger.warn(`upload: step2 threw: ${e.message}`); return null; }
}

export function buildFileDataItem(storagePath, mimeType, filename) {
  return [[storagePath, 1, null, mimeType], filename, null, null, null, null, null, null, [0]];
}
