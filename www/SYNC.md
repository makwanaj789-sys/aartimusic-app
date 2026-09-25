# Favourites sync — what the server has to do

The app half is written and tested. This is the other half, which
lives in the bot's codebase.

**None of it is required.** Every route below may be missing. The app
tries once at startup, gets a 404, and never asks again for the rest
of the session — favourites keep working on the phone exactly as they
did before. So this can be built whenever, and the app already in
people's hands will start syncing the day it appears.

## Who the user is

Two cases, and the server must handle both.

**Inside Telegram.** The app sends `X-Init-Data` with Telegram's
signed `initData`. Verify it the way Telegram documents: build the
check string, HMAC it with a key derived from the bot token, compare.
Reject anything older than a few minutes. The `user.id` inside is the
account. No linking step is needed here.

**The standalone APK.** There is no Telegram around it, so `initData`
is empty and every copy carries the same `X-Dev-Key`. That key proves
the request came from the app; it says nothing about *who*. Hence the
link flow below, after which the app sends
`Authorization: Bearer <token>`.

> The dev key is in `config.js`, which ships inside the APK, so treat
> it as public. It is a doorkeeper, not a password — never let it
> stand in for a user identity.

## Routes

### `POST /api/link/start`

Mint a single-use nonce, store it with a short expiry (two minutes
matches what the app waits), and answer:

```json
{ "nonce": "<random>", "url": "https://t.me/AartiMusic_bot?start=link_<nonce>" }
```

`url` is optional — without it the app builds the same link from
`bot` or falls back to `AartiMusic_bot`.

### The bot side of the link

When someone opens that link, the bot receives `/start link_<nonce>`.
Look the nonce up. If it is unexpired and unclaimed, mint a long-lived
token for that Telegram user id, attach it to the nonce, and reply in
the chat so the person knows it worked.

Refuse a nonce that is expired, already claimed, or unknown. It is the
only thing standing between a stranger and someone's account.

### `GET /api/link/poll?nonce=<nonce>`

```json
{ "pending": true }
```

until the bot claims it, then once:

```json
{ "token": "<long-lived>", "userId": 12345, "name": "Jay" }
```

`name` is shown in the app's account strip; send the first name or
username, nothing more. Retire the nonce after it is handed over.

The app polls every 1.8s and gives up after two minutes. Rate-limit
this route by nonce and by IP.

### `GET /api/favs`

```json
{
  "favs": [ { "id": "...", "title": "...", "artist": "...",
              "thumb": "...", "duration": 214, "at": 1730000000000 } ],
  "gone": { "<songId>": 1730000001000 }
}
```

`at` is when the song was favourited. `gone` maps a song id to when it
was un-favourited.

### `POST /api/favs`

Same shape in the body. Store it as sent.

**Merge on the app side, not the server.** The app already merges what
it holds with what it fetched and posts the result back, so the server
only has to keep the last thing it was given per user. If the server
merges too, the two can disagree and a favourite ping-pongs.

## Why `gone` exists

Without a record that a song was *removed*, the next sync sees it
missing on one side and present on the other, and helpfully puts it
back. The song the user just deleted returns, and it keeps returning
on every device, for ever.

So each side carries both lists, and for any one song id the later
timestamp wins — added later than removed means saved, removed later
than added means gone. Last write wins, per song. Neither side has to
be treated as the truth, which matters when two phones have been
offline in different ways.

There is a test for exactly this: remove a favourite, sync, reload,
and it must stay removed.

## Status codes the app understands

| Code | What the app does |
|---|---|
| `404`, `501` | Decides sync is unsupported, stops asking for this session |
| `401` | Drops the stored token and shows "Saved on this phone" |
| any other error | Ignores it quietly and retries on the next change |

A server that returns 500 for a missing route will be retried on every
favourite. Return 404 for routes that do not exist.

## Worth doing

- Rate-limit `/api/link/start` and `/api/link/poll` — they are the
  only unauthenticated routes here.
- Cap the stored list. A few hundred favourites per user is generous;
  an uncapped list is an uncapped upload.
- Let a token be revoked, so a lost phone can be cut off from the bot.
