package io.github.jofr.capacitor.mediasessionplugin;
import org.json.JSONObject;

/** Validated appearance; coordinates are focal fractions of the cropped overflow. */
public final class CapsuleAppearance {
 public int width=320,height=210;
 public float x=.5f,y=.5f,zoom=1f,visibility=.65f;
 public double start=0,end=0;
 public String media="sunset",file="",kind="video";
 public CapsuleAppearance(JSONObject j) {
  if(j==null)return;
  width=(int)number(j,"width",320,260,380);height=(int)number(j,"height",210,170,260);
  x=(float)number(j,"x",.5,0,1);y=(float)number(j,"y",.5,0,1);zoom=(float)number(j,"zoom",1,1,3);
  visibility=(float)number(j,"visibility",.65,.2,.85);start=number(j,"start",0,0,86400);end=number(j,"end",0,0,86400);
  if(end>0 && end<start+1)end=start+1;
  String m=j.optString("media","sunset");if(m.equals("glass")||m.equals("sunset")||m.equals("starlight")||m.equals("custom"))media=m;
  file=j.optString("file","");if(!file.matches("[a-f0-9-]{36}\\.media"))file="";
  kind=j.optString("kind", "video").equals("image")?"image":"video";
  if(media.equals("custom")&&file.isEmpty())media="glass";
 }
 private static double number(JSONObject j,String k,double d,double min,double max){double v=j.optDouble(k,d);return Double.isFinite(v)?Math.max(min,Math.min(max,v)):d;}
 public JSONObject json(){JSONObject j=new JSONObject();try{j.put("width",width);j.put("height",height);j.put("x",x);j.put("y",y);j.put("zoom",zoom);j.put("visibility",visibility);j.put("start",start);j.put("end",end);j.put("media",media);j.put("file",file);j.put("kind",kind);}catch(Exception ignored){}return j;}
}
