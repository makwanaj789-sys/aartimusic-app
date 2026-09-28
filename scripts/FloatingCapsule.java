package io.github.jofr.capacitor.mediasessionplugin;

import android.animation.ValueAnimator;
import android.app.KeyguardManager;
import android.app.PendingIntent;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.provider.Settings;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.*;
import android.text.TextUtils;
import android.util.Log;
import android.view.*;
import android.view.animation.DecelerateInterpolator;
import android.widget.*;
import java.util.ArrayList;
import java.util.List;

/** Optional view of the existing session. Never owns audio or a second player. */
public final class FloatingCapsule {
    private static FloatingCapsule instance;
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final WindowManager windows;
    private MediaControllerCompat controller;
    private MediaSessionCompat.Token token;
    private final List<Runnable> sessionListeners = new ArrayList<>();
    private boolean foreground = true, dismissed, expanded, permissionScreen;
    private LinearLayout root;
    private TextView title, artist, play;
    private ImageView art;
    private View[] bars;
    private final List<ValueAnimator> beats = new ArrayList<>();
    private String error = "";
    private boolean wasPlaying;

    public static synchronized FloatingCapsule get(Context context) {
        if (instance == null) instance = new FloatingCapsule(context.getApplicationContext());
        return instance;
    }
    private FloatingCapsule(Context context) {
        this.context = context;
        windows = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        BroadcastReceiver screen = new BroadcastReceiver() {
            public void onReceive(Context c, Intent i) {
                if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) hide(); else reconcile();
            }
        };
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED);
        else context.registerReceiver(screen, filter);
    }
    public void attach(MediaSessionCompat.Token next) {
        main.post(() -> {
            if (controller != null) controller.unregisterCallback(callback);
            try {
                token = next;
                controller = new MediaControllerCompat(context, next);
                controller.registerCallback(callback, main);
                for (Runnable listener : new ArrayList<>(sessionListeners)) listener.run();
                reconcile();
            } catch (Exception e) { fail("Could not connect capsule to playback", e); }
        });
    }
    public void detach() {
        main.post(() -> {
            if (controller != null) controller.unregisterCallback(callback);
            controller = null; token = null; hide();
            for (Runnable listener : new ArrayList<>(sessionListeners)) listener.run();
        });
    }
    public MediaSessionCompat.Token sessionToken() { return token; }
    public MediaMetadataCompat metadata() { return controller == null ? null : controller.getMetadata(); }
    public void watchSession(Runnable listener) { sessionListeners.add(listener); listener.run(); }
    public void unwatchSession(Runnable listener) { sessionListeners.remove(listener); }
    public void foreground(boolean active) {
        main.post(() -> {
            foreground = active;
            if (active) { dismissed = false; expanded = false; permissionScreen = false; hide(); }
            else reconcile();
        });
    }
    public void permissionScreen() { permissionScreen = true; hide(); }
    public boolean permitted() { return Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(context); }
    public boolean enabled() { return context.getSharedPreferences("aarti-capsule", 0).getBoolean("enabled", false); }
    public String error() { return error; }
    public void enable(boolean value) {
        context.getSharedPreferences("aarti-capsule", 0).edit().putBoolean("enabled", value).apply();
        error = ""; main.post(this::reconcile);
    }
    public void motion(boolean reduced) {
        context.getSharedPreferences("aarti-capsule", 0).edit().putBoolean("reducedMotion", reduced).apply();
        main.post(() -> { stopBeats(); if (root != null) update(); });
    }
    private boolean animate() {
        return Build.VERSION.SDK_INT >= 26 && ValueAnimator.areAnimatorsEnabled() && !context.getSharedPreferences("aarti-capsule", 0).getBoolean("reducedMotion", false);
    }
    private final MediaControllerCompat.Callback callback = new MediaControllerCompat.Callback() {
        public void onPlaybackStateChanged(PlaybackStateCompat state) { reconcile(); }
        public void onMetadataChanged(MediaMetadataCompat metadata) { reconcile(); }
        public void onSessionDestroyed() { detach(); }
    };
    private boolean playing() {
        PlaybackStateCompat s = controller == null ? null : controller.getPlaybackState();
        return s != null && (s.getState() == PlaybackStateCompat.STATE_PLAYING || s.getState() == PlaybackStateCompat.STATE_BUFFERING);
    }
    private void reconcile() {
        KeyguardManager lock = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PlaybackStateCompat s = controller == null ? null : controller.getPlaybackState();
        boolean valid = s != null && s.getState() != PlaybackStateCompat.STATE_NONE && s.getState() != PlaybackStateCompat.STATE_STOPPED && s.getState() != PlaybackStateCompat.STATE_ERROR;
        if (!enabled() || !permitted() || foreground || permissionScreen || dismissed || !valid || !power.isInteractive() || lock.isKeyguardLocked()) { hide(); return; }
        // Do not introduce a capsule for a paused/restored track. Keep an already-visible one so it can resume.
        if (root == null && !playing()) return;
        if (root == null) show(true); else update();
    }
    private int dp(float n) { return Math.round(n * context.getResources().getDisplayMetrics().density); }
    private GradientDrawable background(int color, int radius) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius));
        d.setStroke(dp(1), 0x554B4436); return d;
    }
    private TextView text(String value, int size, int color) {
        TextView t = new TextView(context); t.setText(value); t.setTextSize(size); t.setTextColor(color); return t;
    }
    private TextView button(String glyph, String description, Runnable click) {
        TextView b = text(glyph, 23, Color.WHITE); b.setGravity(Gravity.CENTER);
        b.setContentDescription(description); b.setBackground(background(0xFF29251F, 24));
        b.setOnClickListener(v -> click.run());
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48))); return b;
    }
    private void togglePlayback() {
        if (controller == null) return;
        if (playing()) controller.getTransportControls().pause(); else controller.getTransportControls().play();
    }
    private void openApp() {
        try {
            PendingIntent open = controller == null ? null : controller.getSessionActivity();
            if (open != null) open.send();
            else { Intent i = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()); if (i != null) { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(i); } }
            hide();
        } catch (Exception e) { fail("Could not open Aarti Music", e); }
    }
    private void expand() { expanded = !expanded; hide(); show(false); }
    private void dismiss() { dismissed = true; hide(); }
    private void show(boolean minimizing) {
        int available = context.getResources().getDisplayMetrics().widthPixels - dp(24);
        int width = Math.min(dp(expanded ? 360 : 300), available);
        root = new LinearLayout(context); root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(10), dp(8), dp(10), dp(8)); root.setBackground(background(0xFF11100E, expanded ? 26 : 36));
        root.setElevation(dp(8));
        LinearLayout row = new LinearLayout(context); row.setGravity(Gravity.CENTER_VERTICAL);
        art = new ImageView(context); art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        art.setBackground(background(0xFFB97932, 18)); art.setClipToOutline(true); art.setContentDescription("Open Aarti Music"); art.setOnClickListener(v -> openApp());
        row.addView(art, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout labels = new LinearLayout(context); labels.setOrientation(LinearLayout.VERTICAL); labels.setPadding(dp(10),0,dp(6),0);
        title = text("Aarti Music", 14, Color.WHITE); title.setSingleLine(); title.setEllipsize(TextUtils.TruncateAt.END);
        artist = text("", 12, 0xFFB6ADA0); artist.setSingleLine(); artist.setEllipsize(TextUtils.TruncateAt.END);
        labels.addView(title); labels.addView(artist); labels.setContentDescription("Expand or collapse music controls"); labels.setOnClickListener(v -> expand());
        row.addView(labels, new LinearLayout.LayoutParams(0, dp(48), 1));
        if (!expanded) { play = button("Ⅱ", "Pause", this::togglePlayback); row.addView(play); }
        row.addView(button(expanded ? "⌃" : "⌄", expanded ? "Collapse controls" : "Expand controls", this::expand));
        root.addView(row);
        if (expanded) {
            LinearLayout controls = new LinearLayout(context); controls.setGravity(Gravity.CENTER); controls.setPadding(0,dp(12),0,dp(6));
            controls.addView(button("|‹", "Previous track", () -> { if (controller != null) controller.getTransportControls().skipToPrevious(); }));
            play = button("Ⅱ", "Pause", this::togglePlayback); controls.addView(play);
            controls.addView(button("›|", "Next track", () -> { if (controller != null) controller.getTransportControls().skipToNext(); }));
            controls.addView(button("↗", "Open Aarti Music", this::openApp));
            controls.addView(button("×", "Dismiss capsule", this::dismiss)); root.addView(controls);
        }
        LinearLayout visualizer = new LinearLayout(context); visualizer.setGravity(Gravity.CENTER); bars = new View[5];
        for (int n=0;n<5;n++) { View bar = new View(context); bar.setBackground(background(0xFFFFBA68, 2)); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(3),dp(8)); p.setMargins(dp(2),0,dp(2),0); visualizer.addView(bar,p); bars[n]=bar; }
        visualizer.setContentDescription("Music playback indicator"); root.addView(visualizer);
        root.setOnLongClickListener(v -> { dismiss(); return true; });
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(width, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL; p.y = dp(8);
        p.setTitle("Aarti Music floating player");
        try {
            windows.addView(root, p); error = ""; update();
            if (animate()) {
                root.setAlpha(0); root.setScaleX(minimizing ? .78f : .95f); root.setScaleY(minimizing ? .78f : .95f); root.setTranslationY(dp(minimizing ? 12 : -4));
                root.animate().alpha(1).scaleX(1).scaleY(1).translationY(0).setDuration(minimizing ? 340 : 180).setInterpolator(new DecelerateInterpolator()).start();
            }
        } catch (RuntimeException e) { fail("Floating player could not be displayed. Check Display over other apps permission.",e); dismissed = true; hide(); }
    }
    private void update() {
        if (root == null || controller == null) return;
        MediaMetadataCompat m = controller.getMetadata();
        if (m != null) {
            title.setText(m.getString(MediaMetadataCompat.METADATA_KEY_TITLE)); artist.setText(m.getString(MediaMetadataCompat.METADATA_KEY_ARTIST));
            Bitmap bitmap = m.getBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART); art.setImageBitmap(bitmap);
        }
        boolean running = playing(); play.setText(running ? "Ⅱ" : "▶"); play.setContentDescription(running ? "Pause" : "Play");
        if (running != wasPlaying || beats.isEmpty()) { stopBeats(); wasPlaying = running;
            if (running && animate()) for (int n=0;n<bars.length;n++) {
                final View bar = bars[n]; ValueAnimator beat = ValueAnimator.ofFloat(.25f,1f); beat.setDuration(350+n*73); beat.setRepeatCount(ValueAnimator.INFINITE); beat.setRepeatMode(ValueAnimator.REVERSE); beat.setStartDelay(n*45L);
                beat.addUpdateListener(a -> bar.setScaleY((float)a.getAnimatedValue())); beats.add(beat); beat.start();
            }
        }
    }
    private void stopBeats() { for (ValueAnimator b : beats) b.cancel(); beats.clear(); if (bars != null) for (View bar : bars) bar.setScaleY(.5f); }
    private void hide() {
        stopBeats(); if (root == null) return; root.animate().cancel();
        try { windows.removeViewImmediate(root); } catch (IllegalArgumentException ignored) { }
        root = null; bars = null;
    }
    private void fail(String message, Exception e) { error = message; Log.e("AartiCapsule",message,e); }
}
