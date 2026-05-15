import { z } from 'zod';

export class RPCPayload {
  constructor({ rpcId, payload = '[]', identifier = 'generic' }) {
    this.rpcId = rpcId;
    this.payload = payload;
    this.identifier = identifier;
  }

  serialize() {
    return [this.rpcId, this.payload, null, this.identifier];
  }
}

function stripPrefix(s, prefix) {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

function ensurePrefix(s, prefix) {
  if (!s) return s;
  return s.startsWith(prefix) ? s : prefix + s;
}

export class ConversationMetadata {
  constructor({ cid = '', rid = '', rcid = '', extra } = {}) {
    this.cid  = stripPrefix(cid,  'c_');
    this.rid  = stripPrefix(rid,  'r_');
    this.rcid = stripPrefix(rcid, 'rc_');
    this.extra = extra ?? new Array(7).fill(null);
  }

  toList() {
    const cid  = this.cid  ? ensurePrefix(this.cid,  'c_')  : '';
    const rid  = this.rid  ? ensurePrefix(this.rid,  'r_')  : '';
    const rcid = this.rcid ? ensurePrefix(this.rcid, 'rc_') : '';
    const tail = [...this.extra];
    while (tail.length < 7) tail.push(null);
    if (tail.length > 7) tail.length = 7;
    return [cid, rid, rcid, ...tail, ''];
  }

  static fromList(data) {
    if (!Array.isArray(data)) return new ConversationMetadata();
    return new ConversationMetadata({
      cid:   typeof data[0] === 'string' && data[0] ? data[0] : '',
      rid:   typeof data[1] === 'string' && data[1] ? data[1] : '',
      rcid:  typeof data[2] === 'string' && data[2] ? data[2] : '',
      extra: data.length > 3 ? data.slice(3, 10) : new Array(7).fill(null),
    });
  }
}

export class Candidate {
  constructor({
    rcid = null, text = null, thoughts = null,
    webImages = null, generatedImages = null,
    generatedMusic = null, generatedVideo = null,
  } = {}) {
    this.rcid = rcid;
    this.text = text;
    this.thoughts = thoughts;
    this.webImages = webImages;
    this.generatedImages = generatedImages;
    this.generatedMusic = generatedMusic;
    this.generatedVideo = generatedVideo;
  }
}

export class StreamResponse {
  constructor({
    metadata = null, candidates = [], text = null,
    thoughts = null, isComplete = false,
    serverModelHash = null, serverModelLabel = null,
  } = {}) {
    this.metadata = metadata ?? new ConversationMetadata();
    this.candidates = candidates;
    this.text = text;
    this.thoughts = thoughts;
    this.isComplete = isComplete;
    this.serverModelHash = serverModelHash;
    this.serverModelLabel = serverModelLabel;
  }

  get hasImages() { return this.candidates.some(c => c.generatedImages?.length > 0); }
  get hasMusic()  { return this.candidates.some(c => c.generatedMusic?.length  > 0); }
  get hasVideo()  { return this.candidates.some(c => c.generatedVideo?.length  > 0); }
}

export class BatchResult {
  constructor({ rpcId = null, data = null, raw = null } = {}) {
    this.rpcId = rpcId;
    this.data = data;
    this.raw = raw;
  }
}

export const ZRPCPayload = z.object({
  rpcId:      z.string(),
  payload:    z.string().default('[]'),
  identifier: z.string().default('generic'),
});

export const ZConversationMetadata = z.object({
  cid:   z.string().default(''),
  rid:   z.string().default(''),
  rcid:  z.string().default(''),
  extra: z.array(z.unknown()).default(() => new Array(7).fill(null)),
});

export const ZCandidate = z.object({
  rcid:            z.string().nullable().optional(),
  text:            z.string().nullable().optional(),
  thoughts:        z.string().nullable().optional(),
  webImages:       z.array(z.unknown()).nullable().optional(),
  generatedImages: z.array(z.unknown()).nullable().optional(),
  generatedMusic:  z.array(z.unknown()).nullable().optional(),
  generatedVideo:  z.array(z.unknown()).nullable().optional(),
});
