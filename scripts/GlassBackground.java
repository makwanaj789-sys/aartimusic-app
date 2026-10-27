package io.github.jofr.capacitor.mediasessionplugin;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.*;
import android.media.MediaPlayer;
import android.os.*;
import android.util.Log;
import android.view.*;
import android.widget.*;
import java.io.File;
import java.util.concurrent.*;

/** Muted decoration with bounded decoding. It never requests audio focus. */
final class GlassBackground extends FrameLayout implements TextureView.SurfaceTextureListener {
 private static final ExecutorService DECODER=Executors.newSingleThreadExecutor();
 private final CapsuleAppearance a;
 private final boolean reduced;
 private final Handler main=new Handler(Looper.getMainLooper());
 private TextureView texture;private ImageView image;
 private MediaPlayer video;private Surface surface;private boolean released,prepared;
 private int videoWidth=1,videoHeight=1;private boolean active=true;
 void active(boolean value){active=value;if(!prepared||video==null||reduced)return;try{if(value&&!video.isPlaying()){video.start();main.post(loop);}else if(!value){video.pause();main.removeCallbacks(loop);}}catch(IllegalStateException ignored){}}
 private final Runnable loop=new Runnable(){public void run(){
  if(released||!prepared||video==null)return;
  try {int start=(int)Math.min(a.start*1000,Math.max(0,video.getDuration()-1000));int end=a.end>0?(int)Math.min(a.end*1000,video.getDuration()):video.getDuration();
   if(video.getCurrentPosition()>=end-80)video.seekTo(start);
  }catch(IllegalStateException e){Log.w("AartiCapsule","Background stopped",e);return;}
  main.postDelayed(this,200);
 }};
 GlassBackground(Context c,CapsuleAppearance appearance,boolean reducedMotion){
  super(c);a=appearance;reduced=reducedMotion;setBackgroundColor(0xAA403F48);
  if(a.media.equals("glass"))return;
  if(a.media.equals("custom")&&a.kind.equals("image")){loadImage();return;}
  if(reduced&&!a.media.equals("custom")){loadPoster();return;}
  texture=new TextureView(c);texture.setOpaque(false);addView(texture,new LayoutParams(-1,-1));texture.setSurfaceTextureListener(this);
 }
 private File custom(){return new File(new File(getContext().getFilesDir(),"capsule-media"),a.file);}
 private void loadPoster(){loadBitmap(true);}
 private void loadImage(){loadBitmap(false);}
 private void loadBitmap(boolean asset){
  image=new ImageView(getContext());image.setScaleType(ImageView.ScaleType.MATRIX);addView(image,new LayoutParams(-1,-1));
  DECODER.execute(()->{
   Bitmap bitmap=null;
   try{
    BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
    if(asset){try(java.io.InputStream in=getContext().getAssets().open("public/capsule-media/"+a.media+".jpg")){BitmapFactory.decodeStream(in,null,bounds);}}
    else BitmapFactory.decodeFile(custom().getPath(),bounds);
    BitmapFactory.Options opts=new BitmapFactory.Options();opts.inSampleSize=1;
    while(Math.max(bounds.outWidth,bounds.outHeight)/opts.inSampleSize>1200)opts.inSampleSize*=2;
    if(asset){try(java.io.InputStream in=getContext().getAssets().open("public/capsule-media/"+a.media+".jpg")){bitmap=BitmapFactory.decodeStream(in,null,opts);}}
    else {
     bitmap=BitmapFactory.decodeFile(custom().getPath(),opts);
     if(bitmap!=null)try{android.media.ExifInterface exif=new android.media.ExifInterface(custom().getPath());int orientation=exif.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION,1);Matrix rotation=new Matrix();
      switch(orientation){case 2:rotation.setScale(-1,1);break;case 3:rotation.setRotate(180);break;case 4:rotation.setScale(1,-1);break;case 5:rotation.setRotate(90);rotation.postScale(-1,1);break;case 6:rotation.setRotate(90);break;case 7:rotation.setRotate(-90);rotation.postScale(-1,1);break;case 8:rotation.setRotate(-90);break;}
      if(!rotation.isIdentity()){Bitmap upright=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),rotation,true);if(upright!=bitmap)bitmap.recycle();bitmap=upright;}
     }catch(java.io.IOException ignored){}
    }
   }catch(Exception e){Log.w("AartiCapsule","Cannot decode background",e);}
   final Bitmap result=bitmap;main.post(()->{if(released){if(result!=null)result.recycle();return;}if(result!=null){image.setImageBitmap(result);image.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->cropImage(result));cropImage(result);}});
  });
 }
 private void cropImage(Bitmap b){if(getWidth()==0||getHeight()==0)return;float scale=Math.max(getWidth()/(float)b.getWidth(),getHeight()/(float)b.getHeight())*a.zoom;Matrix m=new Matrix();m.setScale(scale,scale);m.postTranslate(-(b.getWidth()*scale-getWidth())*a.x,-(b.getHeight()*scale-getHeight())*a.y);image.setImageMatrix(m);}
 private void cropVideo(){if(texture==null||getWidth()==0||getHeight()==0)return;float scale=Math.max(getWidth()/(float)videoWidth,getHeight()/(float)videoHeight)*a.zoom;float w=videoWidth*scale,h=videoHeight*scale;Matrix m=new Matrix();m.setScale(w/getWidth(),h/getHeight());m.postTranslate(-(w-getWidth())*a.x,-(h-getHeight())*a.y);texture.setTransform(m);}
 public void onSurfaceTextureAvailable(SurfaceTexture st,int w,int h){
  if(released)return;
  try{
   surface=new Surface(st);video=new MediaPlayer();video.setVolume(0,0);video.setSurface(surface);
   if(a.media.equals("custom"))video.setDataSource(custom().getPath());
   else {try(AssetFileDescriptor fd=getContext().getAssets().openFd("public/capsule-media/"+a.media+".mp4")){video.setDataSource(fd.getFileDescriptor(),fd.getStartOffset(),fd.getLength());}}
   video.setOnPreparedListener(p->{if(released)return;prepared=true;videoWidth=Math.max(1,p.getVideoWidth());videoHeight=Math.max(1,p.getVideoHeight());cropVideo();p.setVolume(0,0);p.setLooping(false);p.seekTo((int)Math.min(a.start*1000,Math.max(0,p.getDuration()-1000)));if(!reduced&&active){p.start();main.post(loop);}});
   video.setOnCompletionListener(p->{if(!released&&prepared){p.seekTo((int)Math.min(a.start*1000,Math.max(0,p.getDuration()-1000)));if(!reduced&&active)p.start();}});
   video.setOnVideoSizeChangedListener((p,vw,vh)->{videoWidth=Math.max(1,vw);videoHeight=Math.max(1,vh);cropVideo();});
   video.setOnErrorListener((p,what,extra)->{Log.w("AartiCapsule","Unsupported background video: "+what+"/"+extra);releaseVideo();return true;});
   video.prepareAsync();
  }catch(Exception e){Log.w("AartiCapsule","Cannot play decoration",e);releaseVideo();}
 }
 public void onSurfaceTextureSizeChanged(SurfaceTexture st,int w,int h){cropVideo();}
 public boolean onSurfaceTextureDestroyed(SurfaceTexture st){releaseVideo();return true;}
 public void onSurfaceTextureUpdated(SurfaceTexture st){}
 private void releaseVideo(){main.removeCallbacks(loop);prepared=false;if(video!=null){video.setOnPreparedListener(null);video.setOnErrorListener(null);video.release();video=null;}if(surface!=null){surface.release();surface=null;}}
 void release(){released=true;releaseVideo();if(image!=null)image.setImageDrawable(null);}
}
