import * as crypto from 'crypto';

export const Endpoint = {
  GOOGLE: 'https://www.google.com',
  INIT: 'https://gemini.google.com/app',
  GENERATE:
    'https://gemini.google.com/_/BardChatUi/data/' +
    'assistant.lamda.BardFrontendService/StreamGenerate',
  BATCH_EXEC: 'https://gemini.google.com/_/BardChatUi/data/batchexecute',
  UPLOAD: 'https://content-push.googleapis.com/upload',
  ROTATE_COOKIES: 'https://accounts.google.com/RotateCookies',
  PROCESS_GEM_FILE:
    'https://gemini.google.com/_/BardChatUi/data/' +
    'assistant.lamda.BardFrontendService/ProcessFile',
};

export const RPC = {
  LIST_CHATS: 'MaZiqc',
  READ_CHAT: 'hNvQHb',
  DELETE_CHAT: 'GzXR5e',
  LIST_GEMS: 'CNgdBe',
  CREATE_GEM: 'oMH3Zd',
  UPDATE_GEM: 'kHv0Vd',
  DELETE_GEM: 'UXcSJb',
  LIST_NLM_NOTEBOOKS: 'NXpLKc',
  BARD_ACTIVITY: 'ESY5D',
  STATUS_POLL: 'aPya6c',
  ASYNC_POLL: 'kwDCne',
  POST_PROCESS: 'PCck7e',
  INIT_CONFIG: 'otAQ7b',
  INIT_FEATURES: 'GPRiHf',
  INIT_SETTINGS: 'maGuAc',
  INIT_STATE: 'cYRIkd',
  INIT_CAPABILITIES: 'ozz5Z',
  SYNC_STATE: 'L5adhe',
  USER_PREFS: 'K4WWud',
  USAGE_INFO: 'qpEbW',
  ACCOUNT_INFO: 'o30O0e',
  HISTORY_STATE: 'DYBcR',
  NOTIFICATION_STATE: 'ku4Jyf',
};

export const MODEL_HEADER_KEY = 'x-goog-ext-525001261-jspb';
export const TRACKING_HEADER_KEY = 'x-goog-ext-73010989-jspb';
export const SESSION_HEADER_KEY = 'x-goog-ext-525005358-jspb';

export class Model {
  constructor(name, hash = null) {
    this.name = name;
    this.hash = hash;
  }

  get header() {
    if (!this.hash) return {};
    return {
      [MODEL_HEADER_KEY]: `[1,null,null,null,"${this.hash}",null,null,0,[4],null,null,2]`,
    };
  }

  toString() {
    return `Model(name=${JSON.stringify(this.name)}, hash=${JSON.stringify(this.hash)})`;
  }

  equals(other) {
    if (other instanceof Model) return this.name === other.name;
    return false;
  }
}

export const MODELS = {
  unspecified: new Model('unspecified', null),
  fast:        new Model('fast',        '56fdd199312815e2'),
  thinking:    new Model('thinking',    'e051ce1aa80aa576'),
  pro:         new Model('pro',         'e6fa609c3fa255c0'),
};

export const MODEL_ALIASES = {
  flash:   'fast',
  preview: 'fast',
  default: 'fast',
};

export const DEFAULT_MODEL = MODELS.fast;

export const TOKEN_FACTORY_MODELS = new Set(['pro', 'thinking']);

export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/145.0.0.0 Safari/537.36';

export const XBV_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
export const DRIVE_PICKER_API_KEY = 'AIzaSyAw-cTyp9Xotzvu3vNDWhDU3E9NConkKxQ';

export const CHROME_HEADERS = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
  Origin: 'https://gemini.google.com',
  Referer: 'https://gemini.google.com/',
  'User-Agent': CHROME_USER_AGENT,
  'X-Same-Domain': '1',
  'x-browser-channel': 'stable',
  'x-browser-year': '2026',
  'x-client-data': 'CJWJywE=',
  'Sec-Ch-Ua': '"Chromium";v="145", "Google Chrome";v="145", "Not-A.Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

export function computeXbv(userAgent) {
  return crypto.createHash('sha1').update(XBV_API_KEY + userAgent).digest('base64');
}

export function getModel(name) {
  if (name in MODELS) return MODELS[name];
  if (name in MODEL_ALIASES) return MODELS[MODEL_ALIASES[name]];
  const all = Array.from(new Set([...Object.keys(MODELS), ...Object.keys(MODEL_ALIASES)])).sort();
  throw new Error(`Unknown model: ${JSON.stringify(name)}. Available: ${all.join(', ')}`);
}

export const ErrorCode = {
  TEMPORARY_ERROR:        1013,
  USAGE_LIMIT_EXCEEDED:   1037,
  MODEL_INCONSISTENT:     1050,
  MODEL_HEADER_INVALID:   1052,
  IP_TEMPORARILY_BLOCKED: 1060,
};

export const GEMINI_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  Host: 'gemini.google.com',
  Origin: 'https://gemini.google.com',
  Referer: 'https://gemini.google.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/145.0.0.0 Safari/537.36',
  'X-Same-Domain': '1',
};

export const ROTATE_COOKIES_HEADERS = { 'Content-Type': 'application/json' };
export const UPLOAD_HEADERS = { 'Push-ID': 'feeds/mcudyrk2a4khkz' };

export const TOKEN_PATTERNS = {
  snlm0e: /"SNlM0e":\s*"(.*?)"/,
  cfb2h:  /"cfb2h":\s*"(.*?)"/,
  fdrfje: /"FdrFJe":\s*"(.*?)"/,
};

export const EMAIL_PATTERN = /"oPEP7c":\s*"([^"]+@[^"]+)"/;

export const COOKIE_1PSID   = '__Secure-1PSID';
export const COOKIE_1PSIDTS = '__Secure-1PSIDTS';
export const COOKIE_DOMAIN  = '.google.com';

export const COOKIE_REFRESH_INTERVAL = 540;
export const COOKIE_REFRESH_COOLDOWN = 60;

export const ROTATE_COOKIES_BODY = '[000,"-0000000000000000000"]';

export const CONFIG_DIR_NAME     = '.gemini-web-mcp-cli';
export const NLM_CONFIG_DIR_NAME = '.notebooklm-mcp-cli';
export const PROFILES_DIR        = 'profiles';
export const CONFIG_FILE         = 'config.json';
export const AUTH_FILE           = 'auth.json';

export const ENV_PROFILE          = 'GEMCLI_PROFILE';
export const DEFAULT_PROFILE_NAME = 'default';

export const REQID_INCREMENT    = 100000;
export const INNER_REQ_LIST_SIZE = 70;

export const VIDEO_TOOL_ID = 11;
export const IMAGE_TOOL_ID = 14;
export const MUSIC_TOOL_ID = 21;

export const RESPONSE_PATHS = {
  inner_json:               [2],
  metadata:                 [1],
  candidates:               [4],
  completion:               [25],
  error_code:               [5, 2, 0, 1, 0],
  candidate_rcid:           [0],
  candidate_text:           [1, 0],
  candidate_thoughts:       [37, 0, 0],
  candidate_web_images:     [12, 1],
  candidate_generated_images: [12, 7, 0],
  candidate_generated_music:  [12, 86],
  candidate_generated_video:  [12, 59],
};
