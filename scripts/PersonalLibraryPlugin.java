package __PACKAGE__;
import android.app.Activity;
import android.content.Intent;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name="PersonalLibrary")
public class PersonalLibraryPlugin extends Plugin {
 private final String[] keys={"classic","teal","violet","indigo","neon","ruby"};
 private boolean valid(String key){return Arrays.asList(keys).contains(key);}
 private ComponentName component(String key){return new ComponentName(getContext(),getContext().getPackageName()+".Launcher_"+key);}
 @PluginMethod public void getIcon(PluginCall call){
  String icon=getContext().getSharedPreferences("aarti-icon",0).getString("icon","classic");
  JSObject r=new JSObject();r.put("icon",icon);call.resolve(r);
 }
 @PluginMethod public void setIcon(PluginCall call){
  String key=call.getString("icon","classic");
  if(!valid(key)){call.reject("Unknown icon");return;}
  try{
   PackageManager pm=getContext().getPackageManager();
   if(Build.VERSION.SDK_INT>=33){
    List<PackageManager.ComponentEnabledSetting> changes=new ArrayList<>();
    for(String k:keys)changes.add(new PackageManager.ComponentEnabledSetting(component(k),k.equals(key)?PackageManager.COMPONENT_ENABLED_STATE_ENABLED:PackageManager.COMPONENT_ENABLED_STATE_DISABLED,PackageManager.DONT_KILL_APP));
    pm.setComponentEnabledSettings(changes);
   }else{
    pm.setComponentEnabledSetting(component(key),PackageManager.COMPONENT_ENABLED_STATE_ENABLED,PackageManager.DONT_KILL_APP);
    for(String k:keys)if(!k.equals(key))pm.setComponentEnabledSetting(component(k),PackageManager.COMPONENT_ENABLED_STATE_DISABLED,PackageManager.DONT_KILL_APP);
   }
   getContext().getSharedPreferences("aarti-icon",0).edit().putString("icon",key).apply();
   JSObject r=new JSObject();r.put("icon",key);call.resolve(r);
  }catch(Exception e){call.reject("Could not change launcher icon",e);}
 }
 @PluginMethod public void exportBackup(PluginCall call){
  String text=call.getString("data");
  if(text==null||text.getBytes(StandardCharsets.UTF_8).length>8*1024*1024){call.reject("Backup is too large");return;}
  Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,call.getString("name","AartiMusic-backup.json"));
  startActivityForResult(call,i,"backupCreated");
 }
 @ActivityCallback private void backupCreated(PluginCall call,ActivityResult result){
  if(call==null)return;
  if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){cancel(call);return;}
  try(OutputStream out=getContext().getContentResolver().openOutputStream(result.getData().getData(),"wt")){
   if(out==null)throw new IOException("No writable document");
   out.write(call.getString("data","").getBytes(StandardCharsets.UTF_8));out.flush();call.resolve();
  }catch(Exception e){call.reject("Could not save the backup",e);}
 }
 @PluginMethod public void importBackup(PluginCall call){
  Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
  startActivityForResult(call,i,"backupOpened");
 }
 @ActivityCallback private void backupOpened(PluginCall call,ActivityResult result){
  if(call==null)return;
  if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){cancel(call);return;}
  try(InputStream in=getContext().getContentResolver().openInputStream(result.getData().getData());ByteArrayOutputStream out=new ByteArrayOutputStream()){
   if(in==null)throw new IOException("No readable document");
   byte[] buf=new byte[8192];int count;
   while((count=in.read(buf))!=-1){if(out.size()+count>8*1024*1024)throw new IOException("Backup must be under 8 MB");out.write(buf,0,count);}
   JSObject r=new JSObject();r.put("data",new String(out.toByteArray(),StandardCharsets.UTF_8));call.resolve(r);
  }catch(Exception e){call.reject("Could not read this backup",e);}
 }
 private void cancel(PluginCall call){JSObject r=new JSObject();r.put("cancelled",true);call.resolve(r);}
}
