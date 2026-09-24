/* ============================================================
   WHERE THE SERVER IS
   ============================================================ */

// The address the app talks to. Left empty inside Telegram, where the
// app is served by the same server and relative paths already work.
//
// In the Android build there is no such server — the files live on the
// phone — so the address has to be spelled out.
window.AARTI_SERVER = "";

// A tunnel address changes every time the tunnel restarts, and an app
// already on someone's phone can't be edited. So the app asks this
// file where the server is today, and only falls back to the address
// above if it can't reach it.
//
// Point this at a small JSON file you can edit without rebuilding —
// the GitHub Pages site works well:   { "server": "https://..." }
window.AARTI_DISCOVERY =
  "https://makwanaj789-sys.github.io/aartimusic-site/server.json";
