"""Pin review builds to the explicit, cached keystore and verify its certificate."""
from pathlib import Path
import subprocess,sys,hashlib
key=Path('.ci-signing/review.keystore')
if '--verify' in sys.argv:
 import zipfile
 cert=subprocess.check_output(['keytool','-exportcert','-keystore',str(key),'-storepass','android','-alias','androiddebugkey'])
 apk=Path('android/app/build/outputs/apk/debug/app-debug.apk')
 expected=hashlib.sha256(cert).hexdigest().upper()
 output=subprocess.check_output(['keytool','-printcert','-jarfile',str(apk)],text=True).replace(':','')
 if expected not in output:raise SystemExit('APK certificate differs from the persisted review key')
 print('APK signing certificate matches .ci-signing/review.keystore')
else:
 path=Path('android/app/build.gradle')
 text=path.read_text()
 text=text.replace('versionCode 1','versionCode 3').replace('versionName "1.0"','versionName "1.2"')
 text+='''
// Review builds use the same explicitly cached key across CI runs.
android {
    signingConfigs {
        debug {
            storeFile file("../../.ci-signing/review.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
}
'''
 path.write_text(text)
