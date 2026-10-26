# Sonic UI redesign

Reference direction: the supplied 20-second music-app showcase. The app uses the reference's near-black surfaces, oversized editorial headings, tilted artwork prints, coral actions and circular track artwork. The rotating phone and rocks in the video are presentation framing, not in-app navigation.

The new `www/studio.css` loads after the existing component styles. Home discovery creates a featured collage from actual playlist results, with an Explore mix action using the existing playlist route. Search, Collections, Library, onboarding, settings, playlist detail, sheets, navigation and both player sizes share the updated visual system. Fresh installs use Coral; existing saved palettes remain selected. Ocean and Iris join Grove and legacy Amber.

Motion uses short staggered opacity/translation entrances, card print arrivals, directional tab transitions, and the existing shared artwork spring between mini and full player. Reduced-motion preferences disable the added animation. No continuous decorative render loop is added.

Playback, API endpoints, Telegram connection, profile data and saved music formats are unchanged. The review branch is included in the existing APK workflow, which creates a separate review app package as it does for other non-main builds.

Validation: playlist contract tests and UI smoke tests. The UI test covers the featured mix opening the correct playlist, horizontal layout at 320/390/768px, five palette controls, onboarding, shared artwork tap/drag interruption, short-screen player layout, favourites, queue, shuffle/repeat, reduced motion and paused playback restoration. API responses in browser tests are fixtures; live backend and physical Android performance require device testing.
