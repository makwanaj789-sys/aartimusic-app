# Sonic UI redesign

Reference direction: the supplied 20-second music-app showcase. The app uses the reference's near-black surfaces, oversized editorial headings, tilted artwork prints, coral actions and circular track artwork. The rotating phone and rocks in the video are presentation framing, not in-app navigation.

The new `www/studio.css` loads after the existing component styles. Home discovery creates a featured collage from actual playlist results, with an Explore mix action using the existing playlist route. Search, Collections, Library, onboarding, settings, playlist detail, sheets, navigation and both player sizes share the updated visual system. Fresh installs use Coral; existing saved palettes remain selected. Ocean and Iris join Grove and legacy Amber.

Motion uses short staggered opacity/translation entrances, card print arrivals, directional tab transitions, and the existing shared artwork spring between mini and full player. Reduced-motion preferences disable the added animation. No continuous decorative render loop is added.

Playback, API endpoints, Telegram connection, profile data and saved music formats are unchanged. The review branch is included in the existing APK workflow, which creates a separate review app package as it does for other non-main builds.

Validation: playlist contract tests and UI smoke tests. The UI test covers the featured mix opening the correct playlist, horizontal layout at 320/390/768px, five palette controls, onboarding, shared artwork tap/drag interruption, short-screen player layout, favourites, queue, shuffle/repeat, reduced motion and paused playback restoration. API responses in browser tests are fixtures; live backend and physical Android performance require device testing.

## Installed 1.2 upgrade and feature parity

The supplied APK uses `com.aartimusic.player.preview.v3`, version code 3. All 39 public web assets match the `fix/working-apk-playlists` base at `3e827ec`. The redesign is now ported onto that full-featured base rather than the older main branch. Lyrics, capsule media/editor, personal playlists, backup/restore, radio, gesture queue, crossfade, listening stats/mixes, playback speed and native sound presets remain included, with their original test suites.

Update builds retain the v3 package and explicit original signing key, increment to version code 4 / 1.3, and fail closed if the restored certificate differs from the supplied APK. This is built on the original branch so its GitHub Actions signing cache is available. No replacement key is generated.

Fixes: the circular now-playing overlay is aligned exactly with its artwork; the profile avatar scrolls out with the header; bottom navigation has a solid surface and consistent geometry; duplicated Violet theme controls are removed, and new palette choices round-trip through backups. Native system-bar colours use dark surfaces with light icons. Physical Realme installation and live backend playback remain device checks.

### Signing recovery blocker

The original 17 October build saved the matching private keystore only in the Actions cache `aartimusic-review-signing-v3`. The 27 October build reports that cache missing. No keystore is present in repository history or the original build artifacts. APK certificates do not contain the private key.

A compatible update therefore requires a backup of that original keystore. Store its base64 encoding in the repository Actions secret `AARTI_SIGNING_KEY_BASE64`; do not commit the keystore. The build imports it only if needed and validates the pinned public certificate. Both main and working-branch builds now retain the installed package and explicit signing configuration. Without the original key, an in-place Android update cannot be produced; migration to a new signing identity would require backup/restore and explicit user agreement.


## Fresh installation after PR #27

The original 1.2 signing key is unavailable. The owner accepted exporting a backup, uninstalling the old app, and installing the new APK. Review builds now generate a replacement key when neither the new v4 cache nor `AARTI_SIGNING_KEY_BASE64` is available; they no longer require the original certificate. The package ID and all restored features stay unchanged.

The workflow reuses the replacement key while its cache exists. GitHub caches are temporary: permanent update compatibility requires a privately retained keystore supplied as the repository secret `AARTI_SIGNING_KEY_BASE64` (alias `androiddebugkey`, passwords `android`). Never commit or upload the private keystore to public artifacts. A warning is emitted whenever a new key is generated. Export app data before uninstalling; Android removes local app data on uninstall.


## Playback UI follow-up

Playlist panels now slide vertically instead of scaling the whole screen into the Explore button. Profile uploads retain their aspect ratio and fit inside the badge; previously cropped stored photos need to be selected again. Settings contains a separate Choose theme screen, including a persistent White palette. JSON export/import controls were removed at the owner's request; existing local playlists and saved data remain intact. The supplied anime clip is bundled as the new default floating media, with a reduced-motion poster and an Aarti anime preset for existing installations. Existing custom floating media choices are preserved.

Validation: 23 contract tests; UI smoke coverage for White persistence, full-width photo uploads, absent JSON controls, non-scaling playlist transitions; capsule editor coverage for the bundled anime preset. Physical-device rendering still needs a Realme check.


## Button-origin transition and settings categories
Playlist opening now reveals a full-size panel through an animated rounded clip starting at the actual tapped button. Closing reverses the clip to the same button. Text fades at full size rather than being scaled into a black rectangle. Offscreen/missing origins and reduced motion retain a simple fallback. The white playlist surface now stays light.
Settings now offers spaced full-width entries for profile, themes, app icon and (on Android) floating player. Each category opens its own page with Back; contact links remain on the main settings page.
