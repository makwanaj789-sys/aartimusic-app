"""Pin review builds to the explicit, cached keystore and verify its certificate."""
from pathlib import Path
import subprocess,sys,hashlib
key=Path('.ci-signing/review.keystore')
# Public certificate fingerprint of the user's installed AartiMusic 1.2 APK.
INSTALLED_SHA256='E9E8D11AAEB7C9A7D5A9FC9C676A44B88B801F322EAA3B57A279ACFF346F327F'
if not key.is_file():raise SystemExit('Original signing key missing; refusing to create an incompatible update')
cert=subprocess.check_output(['keytool','-exportcert','-keystore',str(key),'-storepass','android','-alias','androiddebugkey'])
if hashlib.sha256(cert).hexdigest().upper()!=INSTALLED_SHA256:
 raise SystemExit('Signing key does not match the installed AartiMusic 1.2 certificate')
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
 text=text.replace('versionCode 1','versionCode 4').replace('versionName "1.0"','versionName "1.3"')
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
