package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.github.jofr.capacitor.mediasessionplugin.AartiLike;
import java.util.Arrays;
import java.util.List;

/* Sound presets, and the bridge for the like button on the lock screen.
 *
 * The music plays inside the WebView, whose audio session Android does
 * not hand out, so the equalizer and bass boost sit on the output mix
 * (session 0). Most phones allow that; some refuse, and then this says
 * so rather than pretending — the app shows the presets as unavailable.
 * "Normal" releases the effects entirely, so the phone's own sound is
 * untouched unless a preset is chosen. The choice is kept and put back
 * when the app starts. */
@CapacitorPlugin(name = "AartiAudio")
public class AartiAudioPlugin extends Plugin {
    private static final List<String> PRESETS = Arrays.asList("normal", "bass", "vocal", "treble", "party");
    private Equalizer eq;
    private BassBoost bass;
    private String preset = "normal";
    private boolean playing = false;
    private String error = "";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("aarti.audio", Context.MODE_PRIVATE);
    }

    @Override
    public void load() {
        AartiLike.listen(() -> notifyListeners("like", new JSObject()));
        preset = prefs().getString("preset", "normal");
        if (!PRESETS.contains(preset)) preset = "normal";
        // A saved preset is applied only while this app is playing.
        // Session 0 must never colour another app after we pause.
    }

    @Override
    protected void handleOnDestroy() {
        AartiLike.listen(null);
        release();
        super.handleOnDestroy();
    }

    private boolean open() {
        if (eq != null) return true;
        try {
            eq = new Equalizer(0, 0);
        } catch (Throwable t) {
            eq = null;
            error = "This phone does not allow sound effects for this app.";
            return false;
        }
        try { bass = new BassBoost(0, 0); } catch (Throwable t) { bass = null; }
        error = "";
        return true;
    }

    private void release() {
        try { if (eq != null) eq.release(); } catch (Throwable ignored) {}
        try { if (bass != null) bass.release(); } catch (Throwable ignored) {}
        eq = null;
        bass = null;
    }

    // Gain in dB for a band centred at `hz`, per preset.
    static int gainDb(String p, int hz) {
        switch (p) {
            case "bass":   return hz <= 150 ? 6 : hz <= 400 ? 3 : 0;
            case "vocal":  return hz < 250 ? -2 : hz < 1000 ? 1 : hz <= 4000 ? 4 : 1;
            case "treble": return hz >= 4000 ? 5 : hz >= 2000 ? 2 : 0;
            case "party":  return hz <= 150 ? 4 : hz < 1000 ? 0 : hz <= 4000 ? 2 : 3;
            default:       return 0;
        }
    }

    private static int bassStrength(String p) {
        return "bass".equals(p) ? 800 : "party".equals(p) ? 500 : 0;
    }

    private boolean apply(String p) {
        if ("normal".equals(p)) { release(); error = ""; return true; }
        if (!open()) return false;
        try {
            short[] range = eq.getBandLevelRange();
            short bands = eq.getNumberOfBands();
            for (short b = 0; b < bands; b++) {
                int hz = eq.getCenterFreq(b) / 1000;
                int mb = Math.max(range[0], Math.min(range[1], gainDb(p, hz) * 100));
                eq.setBandLevel(b, (short) mb);
            }
            if (eq.setEnabled(true) != Equalizer.SUCCESS || !eq.hasControl()) throw new IllegalStateException("Effect unavailable");
            if (bass != null) {
                int s = bassStrength(p);
                if (s > 0 && bass.getStrengthSupported()) { bass.setStrength((short) s); bass.setEnabled(true); }
                else bass.setEnabled(false);
            }
            return true;
        } catch (Throwable t) {
            error = "This phone does not allow sound effects for this app.";
            release();
            return false;
        }
    }

    // Whether effects can be used at all, checked by opening and closing one.
    private boolean supported() {
        if (eq != null) return true;
        if (!open()) return false;
        release();
        return true;
    }

    @PluginMethod
    public void fxStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("supported", supported());
        r.put("preset", preset);
        r.put("error", error);
        call.resolve(r);
    }

    @PluginMethod
    public void fxSet(PluginCall call) {
        String p = call.getString("preset", "normal");
        if (!PRESETS.contains(p)) { call.reject("Unknown preset"); return; }
        if (!apply(p)) { preset = "normal"; prefs().edit().putString("preset", preset).apply(); call.reject(error.isEmpty() ? "Sound effects are not available on this phone." : error); return; }
        if (!playing) release();
        preset = p;
        prefs().edit().putString("preset", p).apply();
        JSObject r = new JSObject();
        r.put("preset", p);
        call.resolve(r);
    }

    @PluginMethod
    public void setPlaying(PluginCall call) {
        playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        if (!playing) release();
        else if (!apply(preset)) {
            preset = "normal";
            prefs().edit().putString("preset", preset).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void setLike(PluginCall call) {
        AartiLike.set(Boolean.TRUE.equals(call.getBoolean("liked", false)), Boolean.TRUE.equals(call.getBoolean("available", true)));
        call.resolve();
    }
}
