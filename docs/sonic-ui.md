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
