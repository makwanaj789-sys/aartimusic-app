package io.github.jofr.capacitor.mediasessionplugin;

/* The like button on the lock screen and in the notification.
 *
 * The media session belongs to the media-session plugin and the
 * favourites belong to the web app, so this is the small meeting point
 * between them: the app says whether the song is liked, the session
 * draws the heart to match, and a tap on the heart is handed back to
 * the app, which owns the favourites and answers with the new state. */
public final class AartiLike {
    public static final String ACTION = "aarti.like";
    public static final String INTENT = "io.github.jofr.capacitor.mediasessionplugin.AARTI_LIKE";

    private static volatile boolean liked = false;
    private static volatile boolean available = false;
    private static volatile Runnable listener;
    private static volatile Runnable refresh;

    private AartiLike() {}

    public static boolean liked() { return liked; }
    public static boolean available() { return available; }

    /** From the app: the song playing is (not) liked; hide the heart when nothing plays. */
    public static void set(boolean isLiked, boolean show) {
        liked = isLiked;
        available = show;
        Runnable r = refresh;
        if (r != null) r.run();
    }

    /** The app's handler for a tap on the heart. */
    public static void listen(Runnable r) { listener = r; }

    static void onRefresh(Runnable r) { refresh = r; }

    static void toggle() {
        Runnable l = listener;
        if (l != null) l.run();
    }
}
