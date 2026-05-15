import { logger } from '../../../@exocore/multi/dist/index.js';

const LENGTH_MARKER_RE = /^(\d+)\n/;

export const JSONP_PREFIX = ")]}'\n";

export function stripJsonpPrefix(text) {
  if (text.startsWith(")]}'")) return text.slice(4).replace(/^\n+/, '');
  return text;
}

function utf16CharCount(s, start, utf16Units) {
  const remaining = s.length - start;
  if (remaining < utf16Units) return [remaining, remaining];
  return [utf16Units, utf16Units];
}

export function parseFrames(content) {
  let pos = 0;
  const total = content.length;
  const frames = [];

  while (pos < total) {
    while (pos < total && /\s/.test(content[pos])) pos++;
    if (pos >= total) break;

    const slice = content.slice(pos);
    const m = slice.match(LENGTH_MARKER_RE);
    if (!m) break;

    const lengthStr = m[1];
    const frameLength = parseInt(lengthStr, 10);
    const contentStart = pos + lengthStr.length;
    const [charCount, unitsFound] = utf16CharCount(content, contentStart, frameLength);

    if (unitsFound < frameLength) break;

    const endPos = contentStart + charCount;
    const chunk = content.slice(contentStart, endPos).trim();
    pos = endPos;

    if (!chunk) continue;

    try {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) frames.push(...parsed);
      else frames.push(parsed);
    } catch {
      logger.debug(`Failed to parse frame JSON: ${chunk.slice(0, 100)}...`);
    }
  }

  return [frames, content.slice(pos)];
}

export function extractJsonFromResponse(text) {
  let content = stripJsonpPrefix(text).replace(/^\s+/, '');

  const [frames] = parseFrames(content);
  if (frames.length > 0) return frames;

  try {
    const parsed = JSON.parse(content.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { /* fall through */ }

  const collected = [];
  for (const rawLine of content.trim().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) collected.push(...parsed);
      else if (parsed !== null && typeof parsed === 'object') collected.push(parsed);
    } catch { continue; }
  }

  if (collected.length > 0) return collected;
  throw new Error('Could not parse any valid JSON from the response.');
}

export function getNested(data, path, defaultValue = null) {
  let current = data;
  for (const key of path) {
    try {
      if (typeof key === 'number') {
        if (Array.isArray(current)) {
          if (key >= -current.length && key < current.length) {
            const idx = key < 0 ? current.length + key : key;
            current = current[idx];
          } else if (
            current.length === 1 &&
            current[0] !== null &&
            typeof current[0] === 'object' &&
            !Array.isArray(current[0])
          ) {
            const protoKey = String(key + 1);
            if (protoKey in current[0]) current = current[0][protoKey];
            else return defaultValue;
          } else return defaultValue;
        } else if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
          const protoKey = String(key + 1);
          if (protoKey in current) current = current[protoKey];
          else return defaultValue;
        } else return defaultValue;
      } else {
        if (current !== null && typeof current === 'object' && !Array.isArray(current) && key in current) {
          current = current[key];
        } else return defaultValue;
      }
    } catch { return defaultValue; }
  }
  return (current ?? defaultValue);
}

export function parseBatchexecuteResponse(text) {
  const frames = extractJsonFromResponse(text);
  const results = [];
  for (const frame of frames) {
    if (!Array.isArray(frame)) continue;
    if (frame.length >= 3 && frame[0] === 'wrb.fr') {
      const rpcId = frame[1];
      const rawJson = frame[2];
      let data = null;
      if (rawJson && typeof rawJson === 'string') {
        try { data = JSON.parse(rawJson); } catch { data = rawJson; }
      }
      results.push({ rpc_id: rpcId, data, raw: rawJson });
    }
  }
  return results;
}

const KNOWN_MODEL_HASHES = new Set([
  '56fdd199312815e2',
  'e051ce1aa80aa576',
  'e6fa609c3fa255c0',
  'fbb127bbb056c959',
  '9d8ca3786ebdfbea',
  '5bf011840784117a',
]);

const KNOWN_MODEL_LABELS = new Set(['Fast', 'Thinking', 'Pro']);

function extractServerModel(data, depth = 0) {
  if (depth > 10 || !Array.isArray(data)) return [null, null];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (typeof item === 'string' && item.length === 16 && KNOWN_MODEL_HASHES.has(item)) {
      let label = null;
      for (let off = 1; off <= 5; off++) {
        if (i + off < data.length) {
          const v = data[i + off];
          if (typeof v === 'string' && KNOWN_MODEL_LABELS.has(v)) { label = v; break; }
        }
      }
      return [item, label];
    }
  }
  for (const item of data) {
    if (Array.isArray(item)) {
      const [h, l] = extractServerModel(item, depth + 1);
      if (h) return [h, l];
    }
  }
  return [null, null];
}

export function parseStreamResponse(text) {
  const frames = extractJsonFromResponse(text);
  const results = [];

  for (const frame of frames) {
    if (!Array.isArray(frame)) continue;
    if (frame.length < 3 || frame[0] !== 'wrb.fr') continue;

    const rawInner = frame[2];
    if (!rawInner || typeof rawInner !== 'string') continue;

    let inner;
    try { inner = JSON.parse(rawInner); } catch { continue; }
    if (!Array.isArray(inner)) continue;

    const result = {
      metadata: getNested(inner, [1]),
      candidates: [],
      text: null,
      thoughts: null,
      completion: getNested(inner, [25]),
      server_model_hash: null,
      server_model_label: null,
    };

    const candidatesData = getNested(inner, [4]);
    if (Array.isArray(candidatesData)) {
      for (const candidate of candidatesData) {
        if (!Array.isArray(candidate)) continue;
        result.candidates.push({
          rcid:             getNested(candidate, [0]),
          text:             getNested(candidate, [1, 0]),
          thoughts:         getNested(candidate, [37, 0, 0]),
          web_images:       getNested(candidate, [12, 1]),
          generated_images: getNested(candidate, [12, 7, 0]),
          generated_music:  getNested(candidate, [12, 86]),
          generated_video:  getNested(candidate, [12, 59]),
        });
      }
      if (result.candidates.length > 0) {
        result.text = result.candidates[0].text;
        result.thoughts = result.candidates[0].thoughts;
      }
    }

    const [hash, label] = extractServerModel(inner);
    if (hash) { result.server_model_hash = hash; result.server_model_label = label; }

    results.push(result);
  }

  return results;
}
