"""Sign fresh-install review builds and verify the resulting APK certificate."""
from pathlib import Path
import subprocess,sys,hashlib,os,base64
key=Path('.ci-signing/review.keystore')
if not key.is_file() and os.environ.get('AARTI_SIGNING_KEY_BASE64'):
 key.parent.mkdir(parents=True,exist_ok=True)
 try: data=base64.b64decode(os.environ['AARTI_SIGNING_KEY_BASE64'],validate=True)
 except ValueError: raise SystemExit('Signing key secret must be valid base64')
 fd=os.open(key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
if not key.is_file():
 if '--verify' in sys.argv:
  raise SystemExit('Signing key missing during APK verification')
 key.parent.mkdir(parents=True,exist_ok=True)
 subprocess.run(['keytool','-genkeypair','-keystore',str(key),
  '-storepass','android','-keypass','android','-alias','androiddebugkey',
  '-keyalg','RSA','-keysize','2048','-validity','10000',
  '-dname','CN=AartiMusic Review,O=AartiMusic,C=IN'],check=True)
 key.chmod(0o600)
 print('::warning::New review signing key generated. Export your app backup before uninstalling the older APK. Cache eviction can require another fresh install; configure AARTI_SIGNING_KEY_BASE64 for durable signing.')
cert=subprocess.check_output(['keytool','-exportcert','-keystore',str(key),'-storepass','android','-alias','androiddebugkey'])
print('Review signing certificate SHA256:',hashlib.sha256(cert).hexdigest().upper())
if '--verify' in sys.argv:
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
