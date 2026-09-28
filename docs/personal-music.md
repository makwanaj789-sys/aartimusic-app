# Personal music update

This continues the supplied working APK baseline. The Telegram bot and backend deployment are unchanged by this update.

## Playback

- A local snapshot stores the current queue, index and playback position every two seconds, and on pause, seeking, page hiding and backgrounding.
- A cold start restores the last track paused. Tap Play to continue from its saved position. A warm resume leaves ongoing audio alone. Android may terminate a process without a lifecycle callback; the periodic checkpoint bounds normal position loss to roughly two seconds.
- Selecting the current track opens the player without assigning a new audio source or changing its queue. Previous/next and explicit play-all actions keep their existing semantics.
- The seek bar accepts horizontal gestures and deliberate taps, with pointer capture and a vertical gesture lock. Vertical motion must not seek. Keyboard arrows move by five seconds.
- Activity resume requests an existing WebView repaint and uses a dark window surface. It does not reload the document or restart audio. This addresses a plausible cause of the reported white surface, but confirmation on the reporting Android device remains necessary.

## Profile and discovery

First launch requires a display name, one or more music languages, and one or more artists. A photo is optional and processed locally to a bounded 256-pixel JPEG. The app supports 35 music languages, including Mandarin, Cantonese, Japanese, Korean, Arabic and Indian languages. This selects music; it does not translate the interface.

Home, Search and Playlists offer artist/language discovery using the existing song and playlist endpoints. Mood/language/artist chips change the query. Recommendations are search-based, not licensed editorial charts or a trained recommendation engine.

Typing offers debounced song/artist suggestions and matching recent searches. IME composition is supported; stale results are ignored, requests are cached/deduplicated, and search submission remains available if suggestions fail.

Open Settings with the avatar button or a swipe from the left edge. Change the profile, photo, languages, artists or Amber/Grove theme; Instagram and Telegram contact links are included. Preferences and photos stay on the device. Existing Telegram favourite sync remains available in Library.

Section transitions, the welcome greeting and drawer motion respect reduced motion. The greeting does not consume taps.

## Installation and validation

Review builds use `com.aartimusic.player.preview.v2`, displayed as **Aarti Music Next**, alongside earlier installed builds. Earlier debug signing keys were ephemeral and cannot be recovered from an APK. CI now caches the review debug key for subsequent builds; losing that cache would require a new signing arrangement. Existing app data remains in its original package and does not automatically migrate.

Browser tests exercise onboarding, suggestions, profile editing, gestures, playback restore and existing controls using fixture API/audio responses with byte-range support. Android compilation checks the generated native activity. Physical-device background playback and white-screen recovery are separate device checks; neither is claimed from browser testing alone.
