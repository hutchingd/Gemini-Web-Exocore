import { URLSearchParams } from 'url';
import { randomUUID } from 'crypto';
import {
  DEFAULT_MODEL, Endpoint, GEMINI_HEADERS, INNER_REQ_LIST_SIZE, REQID_INCREMENT,
} from './constants.js';
import { BatchResult, Candidate, ConversationMetadata, RPCPayload, StreamResponse } from './models.js';
import { parseBatchexecuteResponse, parseStreamResponse } from './parser.js';
import { logger } from '../../../@exocore/multi/dist/index.js';

export function buildBatchexecuteBody(payloads, accessToken) {
  const serialized = [payloads.map(p => p.serialize())];
  const params = new URLSearchParams();
  params.set('f.req', JSON.stringify(serialized));
  params.set('at', accessToken);
  return params.toString() + '&';
}

export function buildBatchexecuteUrl({ rpcIds, reqid, buildLabel, sessionId, sourcePath = '/app' }) {
  const params = new URLSearchParams();
  params.set('rpcids', rpcIds.join(','));
  params.set('source-path', sourcePath);
  if (buildLabel) params.set('bl', buildLabel);
  if (sessionId)  params.set('f.sid', sessionId);
  params.set('hl', 'en');
  params.set('_reqid', String(reqid));
  params.set('rt', 'c');
  return `${Endpoint.BATCH_EXEC}?${params.toString()}`;
}

export function buildStreamgenerateBody({ prompt, accessToken, metadata, fileData, gemId, toolId, stylePreset, botguardToken, botguardHash }) {
  const inner = new Array(INNER_REQ_LIST_SIZE).fill(null);

  const innerZero = [prompt, 0, null, fileData ?? null, null, null, 0];
  if (stylePreset) {
    try {
      // Dynamic import for optional musicPresets — not yet ported
      logger.debug('musicPresets module not yet ported; ignoring stylePreset');
    } catch { /* ignore */ }
  }
  inner[0] = innerZero;
  inner[1] = ['en'];

  if (metadata) inner[2] = metadata.toList();
  else inner[2] = ['', '', '', null, null, null, null, null, null, null];

  if (botguardToken) inner[3] = botguardToken;
  if (botguardHash)  inner[4] = botguardHash;

  inner[6]  = [1];
  inner[7]  = 1;
  inner[10] = 1;
  inner[11] = 0;
  inner[17] = [[0]];
  inner[18] = 0;

  if (gemId) inner[19] = gemId;

  inner[27] = 1;
  inner[30] = [4];
  inner[41] = [1];

  if (toolId !== null && toolId !== undefined) inner[49] = toolId;

  inner[53] = 0;
  inner[59] = randomUUID().toUpperCase();
  inner[61] = [];

  const nowMs = Date.now();
  inner[66] = [Math.floor(nowMs / 1000), (nowMs % 1000) * 1_000_000];
  inner[68] = 2;

  const params = new URLSearchParams();
  params.set('f.req', JSON.stringify([null, JSON.stringify(inner)]));
  params.set('at', accessToken);
  return params.toString() + '&';
}

export function buildStreamgenerateUrl({ reqid, buildLabel, sessionId }) {
  const params = new URLSearchParams();
  if (buildLabel) params.set('bl', buildLabel);
  if (sessionId)  params.set('f.sid', sessionId);
  params.set('hl', 'en');
  params.set('_reqid', String(reqid));
  params.set('rt', 'c');
  return `${Endpoint.GENERATE}?${params.toString()}`;
}

export function buildHeaders(model, cid) {
  const headers = { ...GEMINI_HEADERS };
  if (model && Object.keys(model.header).length > 0) Object.assign(headers, model.header);
  if (cid) {
    const bare = cid.startsWith('c_') ? cid.slice(2) : cid;
    headers.Referer = `https://gemini.google.com/app/${bare}`;
  }
  return headers;
}

export function buildStreamResponse(responseText) {
  const parsedFrames = parseStreamResponse(responseText);
  const result = new StreamResponse();
  const prevMedia = new Map();

  for (const frame of parsedFrames) {
    if (frame.metadata) result.metadata = ConversationMetadata.fromList(frame.metadata);
    if (frame.candidates?.length > 0) {
      const newCandidates = [];
      for (let i = 0; i < frame.candidates.length; i++) {
        const c    = frame.candidates[i];
        const prev = prevMedia.get(i) ?? { images: null, music: null, video: null };
        const candidate = new Candidate({
          rcid: c.rcid, text: c.text, thoughts: c.thoughts, webImages: c.web_images,
          generatedImages: c.generated_images || prev.images,
          generatedMusic:  c.generated_music  || prev.music,
          generatedVideo:  c.generated_video  || prev.video,
        });
        newCandidates.push(candidate);
        prevMedia.set(i, { images: candidate.generatedImages, music: candidate.generatedMusic, video: candidate.generatedVideo });
      }
      result.candidates = newCandidates;
    }
    if (frame.text)       result.text = frame.text;
    if (frame.thoughts)   result.thoughts = frame.thoughts;
    if (frame.completion !== null && frame.completion !== undefined) result.isComplete = true;
    if (frame.server_model_hash) { result.serverModelHash = frame.server_model_hash; result.serverModelLabel = frame.server_model_label; }
  }

  return result;
}

export class RPCTransport {
  #reqid;

  constructor({ client, accessToken, buildLabel = null, sessionId = null }) {
    this.client      = client;
    this.accessToken = accessToken;
    this.buildLabel  = buildLabel;
    this.sessionId   = sessionId;
    this.#reqid = randomInt(10000, 99999);
  }

  #nextReqid() {
    const current = this.#reqid;
    this.#reqid += REQID_INCREMENT;
    return current;
  }

  async batchexecute(payloads, sourcePath = '/app') {
    const rpcIds = payloads.map(p => p.rpcId);
    const url  = buildBatchexecuteUrl({ rpcIds, reqid: this.#nextReqid(), buildLabel: this.buildLabel, sessionId: this.sessionId, sourcePath });
    const body = buildBatchexecuteBody(payloads, this.accessToken);
    const cidFromPath = sourcePath.startsWith('/app/') ? sourcePath.slice('/app/'.length) : null;
    const headers = buildHeaders(null, cidFromPath);

    logger.debug(`batchexecute: ${rpcIds.join(',')}`);
    const response = await this.client.post(url, body, { headers, responseType: 'text', transformResponse: [d => d] });
    if (response.status >= 400) throw new Error(`batchexecute HTTP ${response.status}: ${String(response.data).slice(0, 200)}`);
    return parseBatchexecuteResponse(String(response.data)).map(r => new BatchResult({ rpcId: r.rpc_id, data: r.data, raw: r.raw }));
  }

  async streamGenerate(opts) {
    const url  = buildStreamgenerateUrl({ reqid: this.#nextReqid(), buildLabel: this.buildLabel, sessionId: this.sessionId });
    const body = buildStreamgenerateBody({ prompt: opts.prompt, accessToken: this.accessToken, metadata: opts.metadata, fileData: opts.fileData, gemId: opts.gemId, toolId: opts.toolId, stylePreset: opts.stylePreset });
    const cid = opts.metadata?.cid ?? null;
    const headers = buildHeaders(opts.model ?? DEFAULT_MODEL, cid);

    logger.debug(`StreamGenerate: ${opts.prompt.slice(0, 50)}...`);
    const response = await this.client.post(url, body, { headers, responseType: 'text', transformResponse: [d => d] });
    if (response.status >= 400) throw new Error(`StreamGenerate HTTP ${response.status}: ${String(response.data).slice(0, 200)}`);
    return buildStreamResponse(String(response.data));
  }
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
