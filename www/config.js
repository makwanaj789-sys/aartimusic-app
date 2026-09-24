/* ============================================================
   WHERE THE SERVER IS
   ============================================================ */

// Address to use if the lookup below can't be reached. Usually left
// empty — the lookup is the real answer.
window.AARTI_SERVER = "";

// The free tunnel hands out a new address every time it restarts, and
// an app already on someone's phone can't be edited. So the app asks
// this file where the server is today. The server keeps the file
// current by itself, so nobody has to notice the address moved.
window.AARTI_DISCOVERY =
  "https://makwanaj789-sys.github.io/aartimusic-site/server.json";

// The Android build has no Telegram behind it to sign requests, so it
// carries a key instead. Must match WEBAPP_DEV_KEY in the bot's .env.
window.AARTI_KEY = "aarti-dev-9182";
