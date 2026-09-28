/* Playlist-only transport. Playback and server discovery stay in app.js. */
(function (root) {
  "use strict";
  const validId = /^[A-Za-z0-9_-]{10,}$/;
  function id(ref, allowAnyBare) {
    const value = String(ref || "").trim();
    if (validId.test(value) && (allowAnyBare || /^(PL|UU|OL|RD|FL|LL)/.test(value))) return value;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : "https://" + value);
      if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(url.hostname)) return "";
      const candidate = url.searchParams.get("list") || "";
      return validId.test(candidate) ? candidate : "";
    } catch (_) { return ""; }
  }
  class PlaylistError extends Error {
    constructor(kind, message, status) { super(message); this.kind = kind; this.status = status || 0; }
  }
  function describe(error) {
    const labels = {
      unauthorised: ["Access denied", "The server rejected this app's access. Check the app/server key."],
      forbidden: ["Access blocked", "The server, tunnel or playlist owner denied access."],
      unsupported: ["Playlist search unavailable", "This server does not provide playlist search. You can still try a direct playlist link."],
      not_found: ["Playlist unavailable", "The playlist was not found, or this server has no playlist endpoint."],
      invalid: ["Check the playlist link", "Paste a YouTube playlist link or playlist ID."],
      timeout: ["The server took too long", "Try again in a moment."],
      network: ["Cannot reach the server", "Check your connection and try again."],
      failed: ["Couldn't load playlists", "The server could not complete this request."],
      malformed: ["Unexpected server response", "The server returned an invalid playlist response."],
    };
    const pair = labels[error.kind] || labels.failed;
    return [pair[0], error.message || pair[1]];
  }
  function create(api, options) {
    const opts = Object.assign({ timeout: 30000, ttl: 5 * 60 * 1000, maxEntries: 30, now: Date.now }, options);
    const cache = new Map(), pending = new Map();
    async function fetchData(path, search) {
      let timer;
      const operation = (async () => {
        let response;
        try { response = await api(path); }
        catch (_) { throw new PlaylistError("network", ""); }
        let data;
        try { data = await response.json(); } catch (_) { data = null; }
        const status = response.status;
        const detail = data && typeof data.error === "string" ? data.error.slice(0, 400) : "";
        if (!response.ok) {
          const kind = status === 401 ? "unauthorised" : status === 403 ? "forbidden" :
            status === 404 || status === 501 ? (search ? "unsupported" : "not_found") :
            status === 400 ? "invalid" : "failed";
          throw new PlaylistError(kind, detail, status);
        }
        if (!data || !Array.isArray(data.results)) throw new PlaylistError("malformed", "", status);
        if (data.error && data.kind !== "empty") throw new PlaylistError("failed", detail, status);
        if (data.results.some(item => !item || typeof item.id !== "string" || !item.id)) {
          throw new PlaylistError("malformed", "", status);
        }
        return data;
      })();
      try {
        return await Promise.race([operation, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new PlaylistError("timeout", "")), opts.timeout);
        })]);
      } finally { clearTimeout(timer); }
    }
    async function request(path, search) {
      const saved = cache.get(path);
      if (saved && opts.now() - saved.at < opts.ttl) return saved.data;
      if (pending.has(path)) return pending.get(path);
      const job = fetchData(path, search).then(data => {
        cache.delete(path);
        cache.set(path, { at: opts.now(), data });
        while (cache.size > opts.maxEntries) cache.delete(cache.keys().next().value);
        return data;
      }).catch(error => {
        // Never log headers, cookies or the shared app key.
        console.error("Playlist request failed", { path, status: error.status, kind: error.kind });
        throw error;
      }).finally(() => pending.delete(path));
      pending.set(path, job);
      return job;
    }
    return {
      open(ref) {
        const normalized = id(ref, true);
        if (!normalized) return Promise.reject(new PlaylistError("invalid", ""));
        return request("/api/playlist?id=" + encodeURIComponent(normalized), false);
      },
      search(term) { return request("/api/playlists?q=" + encodeURIComponent(term.trim()), true); },
    };
  }
  const exported = { id, create, describe, PlaylistError };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else root.AartiPlaylists = exported;
})(typeof window !== "undefined" ? window : globalThis);
