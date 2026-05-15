import {
  server,
  logger,
  http,
  cookieJar,
} from "@exocore/multi";
import {
  GeminiClient,
  ConversationMetadata,
  fetchAndUpload,
  AuthError,
  checkCookies,
  importCookiesFromRaw,
  clearCookiesFile,
  loadIntoCookieJar,
} from "./src/index.js";
import { modules } from "./src/index.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_HTML = readFileSync(
  path.join(__dirname, "src/static/index.html"),
  "utf8",
);

const PORT = process.env.PORT ?? 8080;
const app = server.create({
  port:         PORT,
  prettyPrint:  true,
  jiglet:       'EXOCORE',
  cors:         true,
  helmet:       true,
  bodyParser:   true,
  cookieParser: true,
  compression:  true,
  rateLimit: {
    enabled:  true,
    windowMs: 15 * 60 * 1000,
    max:      100,
    message:  'Too many requests',
  },
});

let _client = null;
let _initLock = null;

async function getClient() {
  if (_client?.initialized) return _client;
  if (_initLock) return _initLock;
  _initLock = (async () => {
    const c = new GeminiClient();
    await c.init();
    _client = c;
    return c;
  })().finally(() => {
    _initLock = null;
  });
  return _initLock;
}

async function resetClient() {
  await _client?.close().catch(() => {});
  _client = null;
  _initLock = null;
  cookieJar.clear();
}

function buildMetadata(q) {
  const cid = q.cid ?? "",
    rid = q.rid ?? "",
    rcid = q.rcid ?? "";
  return cid || rid ? new ConversationMetadata({ cid, rid, rcid }) : null;
}

function parseUrls(raw) {
  return raw
    ? raw
        .split(/[\s,]+/)
        .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
    : [];
}

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(DOCS_HTML);
});

app.get("/api/gemini/health", async (_req, res) => {
  const ck = checkCookies();
  res.json(
    http.ok({
      status: "ok",
      client_ready: !!_client?.initialized,
      cookies_valid: ck.valid,
      cookies_path: ck.path,
      jar_size: ck.jar_size,
      providers: Object.keys(modules),
    }),
  );
});

app.get("/api/gemini/cookies", async (_req, res) => {
  res.json(http.ok(checkCookies()));
});

app.post("/api/gemini/cookies", async (req, res) => {
  const raw =
    typeof req.body === "string"
      ? req.body
      : typeof req.body?.raw === "string"
        ? req.body.raw
        : JSON.stringify(req.body ?? "");

  if (!raw.trim()) {
    res.status(400).json(http.err("missing body — paste raw cookie string"));
    return;
  }

  const result = importCookiesFromRaw(raw);
  if (!result.ok) {
    res.status(400).json(http.err(result.error));
    return;
  }

  await resetClient();
  res.json(http.ok(result));
});

app.delete("/api/gemini/cookies", async (_req, res) => {
  await resetClient();
  res.json(http.ok(clearCookiesFile()));
});

app.get("/api/gemini/chat", async (req, res) => {
  const { ask, chat, upload } = req.query;
  const prompt = ask || chat || "";
  const urls = parseUrls(upload ?? "");

  if (!prompt && !urls.length) {
    res
      .status(400)
      .json(http.err("provide ?ask=<message> or ?upload=<url>&chat=<message>"));
    return;
  }

  let client;
  try {
    client = await getClient();
  } catch (e) {
    const code = e instanceof AuthError ? 401 : 503;
    res.status(code).json(http.err(e.message));
    return;
  }

  try {
    const metadata = buildMetadata(req.query);
    let fileData = null;

    if (urls.length) {
      const items = await Promise.all(
        urls.map((u) => fetchAndUpload(u, client)),
      );
      const valid = items.filter(Boolean);
      if (valid.length) fileData = valid;
      else logger.warn("chat: all uploads failed — text-only");
    }

    const response = await client.send(
      prompt || "Describe and explain these files.",
      { metadata, fileData },
    );
    const meta = response.metadata;

    res.json({
      msg: response.text ?? response.candidates?.[0]?.text ?? "",
      cid: meta?.cid ?? "",
      rid: meta?.rid ?? "",
      rcid: meta?.rcid ?? "",
    });
  } catch (e) {
    logger.error(`chat: ${e.message}`);
    res.status(e instanceof AuthError ? 401 : 500).json(http.err(e.message));
  }
});

await new Promise((resolve) => app.listen(PORT, resolve));

loadIntoCookieJar();
logger.info(`gemini-web on :${PORT}`);
logger.info(`providers: ${Object.keys(modules).join(", ")}`);

try {
  await getClient();
  logger.info("client: warm-up done");
} catch (e) {
  logger.warn(
    `client: warm-up failed — POST /api/gemini/cookies to fix. (${e.message})`,
  );
}
