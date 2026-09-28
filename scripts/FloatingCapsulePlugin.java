package __PACKAGE__;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.github.jofr.capacitor.mediasessionplugin.FloatingCapsule;

@CapacitorPlugin(name="FloatingCapsule")
public class FloatingCapsulePlugin extends Plugin {
    private FloatingCapsule capsule() { return FloatingCapsule.get(getContext()); }
    @PluginMethod public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject r = new JSObject(); r.put("enabled",capsule().enabled()); r.put("permitted",capsule().permitted());
            r.put("sessionActive",capsule().sessionToken()!=null); r.put("error",capsule().error()); call.resolve(r);
        });
    }
    @PluginMethod public void configure(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean enabled = call.getBoolean("enabled",false);
            if (enabled && !capsule().permitted()) { call.reject("Allow Display over other apps first."); return; }
            capsule().enable(enabled); capsule().motion(call.getBoolean("reducedMotion",false)); call.resolve();
        });
    }
    @PluginMethod public void requestPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                capsule().permissionScreen();
                Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getContext().getPackageName()));
                getActivity().startActivity(i); call.resolve();
            } catch (Exception e) { call.reject("Could not open overlay settings",e); }
        });
    }
}
