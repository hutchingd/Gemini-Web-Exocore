export class CookieJar {
  #jar = new Map();

  constructor(initial = {}) {
    for (const [k, v] of Object.entries(initial)) this.#jar.set(k, v);
  }

  get(name) { return this.#jar.get(name); }
  set(name, value) { this.#jar.set(name, value); }
  delete(name) { this.#jar.delete(name); }
  size() { return this.#jar.size; }

  toObject() { return Object.fromEntries(this.#jar.entries()); }

  replaceAll(cookies) {
    this.#jar.clear();
    for (const [k, v] of Object.entries(cookies)) this.#jar.set(k, v);
  }

  merge(cookies) {
    for (const [k, v] of Object.entries(cookies)) this.#jar.set(k, v);
  }

  toHeader() {
    const parts = [];
    for (const [name, value] of this.#jar.entries()) parts.push(`${name}=${value}`);
    return parts.join('; ');
  }

  ingestSetCookie(header) {
    const semi = header.indexOf(';');
    const pair = semi === -1 ? header : header.slice(0, semi);
    const eq = pair.indexOf('=');
    if (eq === -1) return;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) return;
    this.#jar.set(name, value);
  }

  attachTo(client) {
    client.interceptors.request.use((config) => {
      const header = this.toHeader();
      if (header) {
        if (!config.headers) config.headers = {};
        config.headers['Cookie'] = header;
      }
      return config;
    });
    client.interceptors.response.use((res) => {
      const setCookies = res.headers?.['set-cookie'];
      if (Array.isArray(setCookies)) {
        for (const sc of setCookies) this.ingestSetCookie(sc);
      } else if (typeof setCookies === 'string') {
        this.ingestSetCookie(setCookies);
      }
      return res;
    });
    return client;
  }
}
