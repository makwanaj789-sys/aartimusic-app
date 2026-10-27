package __PACKAGE__;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.provider.Settings;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import io.github.jofr.capacitor.mediasessionplugin.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;

@CapacitorPlugin(name="FloatingCapsule")
public class FloatingCapsulePlugin extends Plugin {
 private final ExecutorService files=Executors.newSingleThreadExecutor();
 private FloatingCapsule capsule(){return FloatingCapsule.get(getContext());}
 @Override public void load(){getActivity().runOnUiThread(()->capsule().controls(action->{JSObject d=new JSObject();d.put("action",action);notifyListeners("control",d);}));}
 @Override protected void handleOnDestroy(){getActivity().runOnUiThread(()->capsule().controls(null));files.shutdown();super.handleOnDestroy();}
 private File folder(){File f=new File(getContext().getFilesDir(),"capsule-media");f.mkdirs();return f;}
 private JSObject appearance() throws Exception {
  CapsuleAppearance a=capsule().appearance();JSObject j=new JSObject(a.json().toString());
  if(a.media.equals("custom"))j.put("previewUri",Uri.fromFile(new File(folder(),a.file)).toString());return j;
 }
 @PluginMethod public void status(PluginCall call){getActivity().runOnUiThread(()->{try{
  JSObject r=new JSObject();r.put("enabled",capsule().enabled());r.put("permitted",capsule().permitted());r.put("sessionActive",capsule().sessionToken()!=null);r.put("error",capsule().error());r.put("appearance",appearance());call.resolve(r);
 }catch(Exception e){call.reject("Could not read floating settings",e);}});}
 @PluginMethod public void configure(PluginCall call){getActivity().runOnUiThread(()->{
  boolean enabled=call.getBoolean("enabled",false);if(enabled&&!capsule().permitted()){call.reject("Allow Display over other apps first.");return;}
  capsule().enable(enabled);capsule().motion(call.getBoolean("reducedMotion",false));call.resolve();
 });}
 @PluginMethod public void setAppearance(PluginCall call){getActivity().runOnUiThread(()->{try{
  JSObject raw=call.getObject("appearance");if(raw==null){call.reject("Missing appearance");return;}
  CapsuleAppearance a=new CapsuleAppearance(raw);
  if(a.media.equals("custom")&&!new File(folder(),a.file).isFile()){call.reject("Choose that photo or video again.");return;}
  capsule().appearance(a);call.resolve(appearance());
 }catch(Exception e){call.reject("Could not save appearance",e);}});}
 @PluginMethod public void syncModes(PluginCall call){getActivity().runOnUiThread(()->{capsule().modes(call.getBoolean("shuffle",false),call.getString("repeat","off"));call.resolve();});}
 @PluginMethod public void requestPermission(PluginCall call){getActivity().runOnUiThread(()->{try{
  capsule().permissionScreen();startActivityForResult(call,new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getContext().getPackageName())),"overlayPermissionResult");
 }catch(Exception e){call.reject("Could not open overlay settings",e);}});}
 @ActivityCallback private void overlayPermissionResult(PluginCall call,ActivityResult result){if(call==null)return;JSObject r=new JSObject();r.put("permitted",capsule().permitted());call.resolve(r);}
 @PluginMethod public void pickMedia(PluginCall call){
  getActivity().runOnUiThread(()->{capsule().permissionScreen();Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","video/*"});startActivityForResult(call,i,"mediaPicked");});
 }
 @ActivityCallback private void mediaPicked(PluginCall call,ActivityResult result){
  if(call==null)return;
  if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){JSObject r=new JSObject();r.put("cancelled",true);call.resolve(r);return;}
  Uri uri=result.getData().getData();files.execute(()->{
   File target=new File(folder(),UUID.randomUUID()+".media");
   try{
    String type=getContext().getContentResolver().getType(uri);
    if(type==null||(!type.startsWith("image/")&&!type.startsWith("video/")))throw new IOException("Choose a supported photo or video.");
    try(InputStream in=getContext().getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(target)){
     if(in==null)throw new IOException("File could not be opened");byte[] buffer=new byte[65536];int n;long size=0;
     while((n=in.read(buffer))!=-1){size+=n;if(size>100L*1024*1024)throw new IOException("Choose a file smaller than 100 MB.");out.write(buffer,0,n);}
    }
    int w,h;double duration=0;String kind=type.startsWith("video/")?"video":"image";
    if(kind.equals("video")){
     MediaMetadataRetriever m=new MediaMetadataRetriever();try{m.setDataSource(target.getPath());w=Integer.parseInt(m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));h=Integer.parseInt(m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));duration=Double.parseDouble(m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION))/1000.0;}finally{m.release();}
    }else{BitmapFactory.Options b=new BitmapFactory.Options();b.inJustDecodeBounds=true;BitmapFactory.decodeFile(target.getPath(),b);w=b.outWidth;h=b.outHeight;}
    if(w<1||h<1)throw new IOException("This media format could not be read.");
    JSObject r=new JSObject();r.put("media","custom");r.put("file",target.getName());r.put("kind",kind);r.put("widthPixels",w);r.put("heightPixels",h);r.put("duration",duration);r.put("previewUri",Uri.fromFile(target).toString());
    // Preserve the active selection and the new draft; clean older cancelled drafts.
    String active=capsule().appearance().file;File[] old=folder().listFiles();if(old!=null)for(File f:old)if(!f.getName().equals(active)&&!f.equals(target))f.delete();
    call.resolve(r);
   }catch(Exception e){target.delete();call.reject(e.getMessage()==null?"Could not import media":e.getMessage(),e);}
  });
 }
}
