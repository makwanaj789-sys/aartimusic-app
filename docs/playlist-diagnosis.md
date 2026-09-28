# Playlist diagnosis — 28 September 2026

The supplied APK's JavaScript exactly matches app commit
`aecd431c1ca23c1d755c8c705e111abb9caee2d9`. This branch restores the
supplied APK's web assets before changing playlist handling. Native
build scripts, configuration, and playback code are retained.

## Findings

- APK playlist search calls `GET /api/playlists?q=...`.
- The current `aarti-music/api/webapi.py` source registers
  `GET /api/playlist`, but does not register `/api/playlists`.
  Repository code search also found no implementation of that route.
  This is a source-level contract mismatch; live deployment is unverified.
- `api/search_engine.py` already implements flat extraction and reuses
  cookies and PO-token wiring. `api/webapi.py` already caches successful
  playlist detail responses for 15 minutes. Adding these again is not
  an evidence-based fix.
- The APK hides HTTP error details for playlist detail requests and
  treats error JSON containing an empty results array as an empty playlist.
- Authenticated and unauthenticated curl requests from this workspace
  to the discovered tunnel returned HTTP 403, text `Your request was blocked.`,
  with Cloudflare headers. This does not establish whether the running
  Python handler is failing. No SSH/server execution access was available.

## Request used

The authenticated request used the X-Dev-Key from the supplied APK's
config, without modifying any server configuration. Equivalent command:

```sh
curl -sS --max-time 20 -i \
  -H "X-Dev-Key: $WEBAPP_DEV_KEY" \
  'https://emma-cottage-deferred-videos.trycloudflare.com/api/playlists?q=Arijit'
```

The tunnel URL may change; use the current server.json value.

For on-server verification, set AARTI_API_BASE to the actual local HTTP
listener (including its port), load WEBAPP_DEV_KEY through your normal
server environment, and set PLAYLIST_ID to a known public playlist:

```sh
curl -sS --max-time 45 -i --get \
  -H "X-Dev-Key: $WEBAPP_DEV_KEY" \
  --data-urlencode 'q=Arijit' \
  "${AARTI_API_BASE:?Set the local API base URL}/api/playlists"

curl -sS --max-time 45 -i --get \
  -H "X-Dev-Key: $WEBAPP_DEV_KEY" \
  --data-urlencode "id=${PLAYLIST_ID:?Set a public playlist ID}" \
  "${AARTI_API_BASE:?Set the local API base URL}/api/playlist"
```

Do not share keys or cookies in logs. Record status, response body and
matching playlist error logs. Repeat the detail request to check
X-Playlist-Cache: HIT.

## App changes

Playlist-only transport validates responses, distinguishes errors from
empty lists, bounds waiting at 30 seconds, caches successful responses for
five minutes (maximum 30 entries), and coalesces simultaneous requests.
The UI ignores responses superseded by another playlist or a closed view.
Playback/queue handlers and server discovery are unchanged from the APK.
The timeout releases the UI; it does not cancel an extraction already
running on the server.

## Backend change requiring owner permission

The owner explicitly forbids changes to the bot repository without prior
permission. No bot files were modified. Proposed scope: implement and
register only playlist search in api/search_engine.py and api/webapi.py,
with bounded flat extraction, existing authentication, bounded caching,
and explicit logged failures. Investigate the direct-link failure from
on-server responses before deciding whether additional changes are needed.

Player animation, opening animation, icon and recommendation changes are
pending the owner's requested playlist-first gate. This branch is not a
finished replacement APK or a verified end-to-end playlist fix.
