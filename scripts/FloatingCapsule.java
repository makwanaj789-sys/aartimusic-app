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
    private boolean foreground = true, dismissed, expanded = true, permissionScreen;
    private FrameLayout root;
    private GlassBackground glass;
    private CapsuleAppearance appearance;
    private CapsuleIcon playIcon,shuffleIcon,repeatIcon;
    private TextView elapsed,remaining;
    private SeekBar seek;
    private boolean seeking,shuffle;
    private String repeat="off";
    public interface Controls { void action(String action); }
    private Controls controls;
    public void controls(Controls value) { controls=value; }
    public void modes(boolean random,String loop) { shuffle=random;repeat=loop; if(root!=null)update(); }
    public CapsuleAppearance appearance(){
        try{return new CapsuleAppearance(new org.json.JSONObject(context.getSharedPreferences("aarti-capsule",0).getString("appearance","{}")));}
        catch(Exception e){return new CapsuleAppearance(null);}
    }
    public void appearance(CapsuleAppearance value){context.getSharedPreferences("aarti-capsule",0).edit().putString("appearance",value.json().toString()).apply();main.post(()->{hide();reconcile();});}
    private final Runnable progressTick=new Runnable(){public void run(){if(root==null)return;progress();main.postDelayed(this,500);}};
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
            if (active) { dismissed = false; expanded = true; permissionScreen = false; hide(); }
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
    private CapsuleIcon icon(String name,String label,Runnable action,int size){CapsuleIcon v=new CapsuleIcon(context,name,label,action);v.setLayoutParams(new LinearLayout.LayoutParams(dp(size),dp(size)));return v;}
    private String time(long millis){long seconds=Math.max(0,millis/1000);return String.format(java.util.Locale.US,"%d:%02d",seconds/60,seconds%60);}
    private void progress(){
        if(controller==null||seek==null||seeking)return;
        PlaybackStateCompat state=controller.getPlaybackState();MediaMetadataCompat data=controller.getMetadata();
        long duration=data==null?0:data.getLong(MediaMetadataCompat.METADATA_KEY_DURATION),position=state==null?0:state.getPosition();
        if(state!=null&&state.getState()==PlaybackStateCompat.STATE_PLAYING&&state.getLastPositionUpdateTime()>0)position+=(long)((SystemClock.elapsedRealtime()-state.getLastPositionUpdateTime())*state.getPlaybackSpeed());
        position=Math.max(0,Math.min(duration,position));seek.setEnabled(duration>0);seek.setProgress(duration>0?(int)(position*1000/duration):0);
        elapsed.setText(time(position));remaining.setText("−"+time(duration-position));
    }
    private void show(boolean minimizing) {
        appearance=appearance();int available=context.getResources().getDisplayMetrics().widthPixels-dp(24);
        int width=Math.min(dp(appearance.width),available),height=dp(expanded?appearance.height:82);
        root=new FrameLayout(context);root.setBackground(background(0x99666570,26));root.setClipToOutline(true);root.setElevation(dp(8));
        glass=new GlassBackground(context,appearance,!animate());glass.setAlpha(appearance.visibility);root.addView(glass,new FrameLayout.LayoutParams(-1,-1));
        View tint=new View(context);android.graphics.drawable.GradientDrawable shade=new android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0x550A0A10,0x880A0A10});tint.setBackground(shade);root.addView(tint,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout content=new LinearLayout(context);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(14),dp(10),dp(14),dp(8));root.addView(content,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout row=new LinearLayout(context);row.setGravity(Gravity.CENTER_VERTICAL);
        art=new ImageView(context);art.setScaleType(ImageView.ScaleType.CENTER_CROP);art.setBackground(background(0xFFB97932,12));art.setClipToOutline(true);art.setContentDescription("Open AartiMusic");art.setOnClickListener(v->openApp());row.addView(art,new LinearLayout.LayoutParams(dp(44),dp(44)));
        LinearLayout labels=new LinearLayout(context);labels.setOrientation(LinearLayout.VERTICAL);labels.setPadding(dp(9),dp(2),dp(4),dp(2));labels.setBackground(background(0x33000000,8));
        title=text("AartiMusic",15,Color.WHITE);title.setTypeface(null,Typeface.BOLD);title.setSingleLine();title.setEllipsize(TextUtils.TruncateAt.END);title.setShadowLayer(3,0,1,Color.BLACK);
        artist=text("",12,0xFFF2ECF5);artist.setSingleLine();artist.setEllipsize(TextUtils.TruncateAt.END);artist.setShadowLayer(3,0,1,Color.BLACK);labels.addView(title);labels.addView(artist);labels.setOnClickListener(v->openApp());row.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
        if(!expanded){playIcon=icon("pause","Pause",this::togglePlayback,44);row.addView(playIcon);}
        row.addView(icon(expanded?"collapse":"expand",expanded?"Compact player":"Expand player",this::expand,32));row.addView(icon("close","Dismiss player",this::dismiss,32));content.addView(row);
        if(expanded){
            View spacer=new View(context);content.addView(spacer,new LinearLayout.LayoutParams(1,0,1));
            LinearLayout times=new LinearLayout(context);elapsed=text("0:00",11,Color.WHITE);remaining=text("−0:00",11,Color.WHITE);elapsed.setShadowLayer(3,0,1,Color.BLACK);remaining.setShadowLayer(3,0,1,Color.BLACK);times.addView(elapsed,new LinearLayout.LayoutParams(0,-2,1));times.addView(remaining);content.addView(times);
            seek=new SeekBar(context);seek.setMax(1000);seek.setPadding(dp(3),0,dp(3),0);seek.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.WHITE));seek.setThumbTintList(android.content.res.ColorStateList.valueOf(Color.WHITE));seek.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0x66FFFFFF));
            seek.setContentDescription("Seek in current song");seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
                public void onStartTrackingTouch(SeekBar bar){seeking=true;}
                public void onProgressChanged(SeekBar bar,int value,boolean user){}
                public void onStopTrackingTouch(SeekBar bar){seeking=false;if(controller!=null){MediaMetadataCompat m=controller.getMetadata();long d=m==null?0:m.getLong(MediaMetadataCompat.METADATA_KEY_DURATION);if(d>0)controller.getTransportControls().seekTo(d*bar.getProgress()/1000);}}
            });content.addView(seek,new LinearLayout.LayoutParams(-1,dp(26)));
            LinearLayout buttons=new LinearLayout(context);buttons.setGravity(Gravity.CENTER);
            shuffleIcon=icon("shuffle","Toggle shuffle",()->{if(controls!=null)controls.action("shuffle");},44);
            playIcon=icon("pause","Pause",this::togglePlayback,44);
            repeatIcon=icon("repeat","Change repeat mode",()->{if(controls!=null)controls.action("repeat");},44);
            for(View v:new View[]{shuffleIcon,icon("previous","Previous track",()->{if(controller!=null)controller.getTransportControls().skipToPrevious();},44),playIcon,icon("next","Next track",()->{if(controller!=null)controller.getTransportControls().skipToNext();},44),repeatIcon}){LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(44),1);buttons.addView(v,lp);}
            content.addView(buttons);main.post(progressTick);
        }
        root.setOnLongClickListener(v->{dismiss();return true;});
        WindowManager.LayoutParams p=new WindowManager.LayoutParams(width,height,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,PixelFormat.TRANSLUCENT);
        p.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;p.y=dp(12);p.setTitle("AartiMusic glass player");
        try{windows.addView(root,p);error="";update();if(animate()){root.setAlpha(0);root.setScaleX(.9f);root.setScaleY(.9f);root.setTranslationY(dp(10));root.animate().alpha(1).scaleX(1).scaleY(1).translationY(0).setDuration(300).setInterpolator(new DecelerateInterpolator()).start();}}
        catch(RuntimeException e){fail("Could not show floating player. Check display permission.",e);dismissed=true;hide();}
    }
    private void update() {
        if (root == null || controller == null) return;
        MediaMetadataCompat m = controller.getMetadata();
        if (m != null) {
            title.setText(m.getString(MediaMetadataCompat.METADATA_KEY_TITLE)); artist.setText(m.getString(MediaMetadataCompat.METADATA_KEY_ARTIST));
            Bitmap bitmap = m.getBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART); art.setImageBitmap(bitmap);
        }
        boolean running=playing();playIcon.name=running?"pause":"play";playIcon.setContentDescription(running?"Pause":"Play");playIcon.invalidate();
        if(shuffleIcon!=null){shuffleIcon.active=shuffle;shuffleIcon.setContentDescription(shuffle?"Shuffle on":"Shuffle off");shuffleIcon.invalidate();}
        if(repeatIcon!=null){repeatIcon.active=!repeat.equals("off");repeatIcon.name=repeat.equals("one")?"repeatOne":"repeat";repeatIcon.setContentDescription("Repeat "+repeat);repeatIcon.invalidate();}
        if(glass!=null)glass.active(running);progress();
    }

    private void stopBeats() { for (ValueAnimator b : beats) b.cancel(); beats.clear(); if (bars != null) for (View bar : bars) bar.setScaleY(.5f); }
    private void hide() {
        stopBeats(); main.removeCallbacks(progressTick); seeking=false;seek=null;shuffleIcon=null;repeatIcon=null; if(glass!=null){glass.release();glass=null;} if (root == null) return; root.animate().cancel();
        try { windows.removeViewImmediate(root); } catch (IllegalArgumentException ignored) { }
        root = null; bars = null;
    }
    private void fail(String message, Exception e) { error = message; Log.e("AartiCapsule",message,e); }
}
