#!/usr/bin/env python3
"""
Writes the one native class that can answer "what is this playing
through?".

The WebView cannot know. Chrome on Android does not enumerate audio
*outputs* at all, so from www/ there is no honest way to tell a pair
of earbuds from the phone's own speaker — and a label that guesses is
worse than no label. Android itself knows, through AudioManager, and
this is the smallest thing that asks it.

On Android 12 and up it asks which device media would actually be
routed to right now, which is the real answer. Below that it takes
the best of the available outputs, preferring Bluetooth, then
anything wired, then the speaker.

Nothing is requested and no permission is added: AudioDeviceInfo is
readable as it stands, and where a name is withheld the kind of
device is still worth showing.

Written into the generated project at build time, like the other
scripts here, because android/ is not in the repo. Idempotent.
"""

import json
import os
import sys

PLUGIN = "AudioOutPlugin"

JAVA = '''package {pkg};

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * What the music is coming out of.
 *
 * The WebView has no way to know — Chrome on Android does not
 * enumerate audio outputs — so this asks Android, which does.
 *
 * Answers with a kind ("bluetooth", "wired", "speaker" or "") and a
 * name where one is offered. An empty kind means it could not tell,
 * and the app shows nothing rather than a guess.
 */
@CapacitorPlugin(name = "AudioOut")
public class {name} extends Plugin {{

    @PluginMethod
    public void current(PluginCall call) {{
        JSObject out = new JSObject();
        out.put("kind", "");
        out.put("name", "");

        // AudioDeviceInfo arrived in Marshmallow; below it there is
        // nothing reliable to read, so nothing is claimed.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {{
            call.resolve(out);
            return;
        }}

        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) {{
            call.resolve(out);
            return;
        }}

        AudioDeviceInfo picked = null;

        // Android 12 can say where media would actually go, which is
        // the question being asked rather than a guess from a list.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {{
            try {{
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                List<AudioDeviceInfo> routed = am.getAudioDevicesForAttributes(attrs);
                if (routed != null && !routed.isEmpty()) {{
                    picked = routed.get(0);
                }}
            }} catch (Exception ignored) {{
                // fall through to the list below
            }}
        }}

        if (picked == null) {{
            try {{
                int best = -1;
                for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {{
                    int rank = rank(d.getType());
                    if (rank > best) {{
                        best = rank;
                        picked = d;
                    }}
                }}
            }} catch (Exception ignored) {{
                // leave it unknown
            }}
        }}

        if (picked != null) {{
            String kind = kindOf(picked.getType());
            out.put("kind", kind);

            String name = "";
            try {{
                CharSequence product = picked.getProductName();
                if (product != null) {{
                    name = product.toString().trim();
                }}
            }} catch (Exception ignored) {{
            }}

            // The speaker's product name is the phone's model, which
            // is not what anyone calls it.
            if (kind.equals("speaker")) {{
                name = "Phone speaker";
            }}
            out.put("name", name);
        }}

        call.resolve(out);
    }}

    /** Which of several available outputs is the one in use. */
    private static int rank(int type) {{
        switch (type) {{
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                return 5;
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                return 4;
            case AudioDeviceInfo.TYPE_HDMI:
            case AudioDeviceInfo.TYPE_AUX_LINE:
            case AudioDeviceInfo.TYPE_LINE_ANALOG:
                return 3;
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return 1;
            default:
                return 0;
        }}
    }}

    private static String kindOf(int type) {{
        switch (type) {{
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                return "bluetooth";
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                return "wired";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return "speaker";
            default:
                return "other";
        }}
    }}
}}
'''

MAIN = '''package {pkg};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Plugins that live in this app rather than in a package have to be
 * named here, before the bridge is built. {name} is the only one.
 */
public class MainActivity extends BridgeActivity {{

    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin({name}.class);
        super.onCreate(savedInstanceState);
    }}
}}
'''

root = sys.argv[1] if len(sys.argv) > 1 else "."
config = os.path.join(root, "capacitor.config.json")

try:
    app_id = json.load(open(config, encoding="utf-8"))["appId"]
except (OSError, KeyError) as e:
    sys.exit(f"cannot read appId from {config}: {e}")

pkg_dir = os.path.join(root, "android/app/src/main/java", *app_id.split("."))
main = os.path.join(pkg_dir, "MainActivity.java")

if not os.path.isfile(main):
    sys.exit(f"no {main} — run `cap add android` before this")

with open(os.path.join(pkg_dir, PLUGIN + ".java"), "w", encoding="utf-8") as f:
    f.write(JAVA.format(pkg=app_id, name=PLUGIN))

# The generated MainActivity is an empty subclass; it is replaced
# rather than edited, so re-running cannot register the plugin twice.
with open(main, "w", encoding="utf-8") as f:
    f.write(MAIN.format(pkg=app_id, name=PLUGIN))

print(f"{PLUGIN}.java written and registered in MainActivity")
