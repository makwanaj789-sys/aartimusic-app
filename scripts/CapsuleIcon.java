package io.github.jofr.capacitor.mediasessionplugin;
import android.content.Context;
import android.graphics.*;
import android.view.View;

final class CapsuleIcon extends View {
 String name;boolean active;private final Paint paint=new Paint(3);
 CapsuleIcon(Context c,String name,String label,Runnable action){super(c);this.name=name;setContentDescription(label);setFocusable(true);setOnClickListener(v->action.run());}
 protected void onDraw(Canvas canvas){super.onDraw(canvas);float side=Math.min(getWidth(),getHeight());canvas.save();canvas.translate((getWidth()-side)/2,(getHeight()-side)/2);canvas.scale(side/44,side/44);
  paint.setColor(0x55000000);paint.setStyle(Paint.Style.FILL);canvas.drawRoundRect(2,2,42,42,20,20,paint);
  canvas.translate(10,10);paint.setColor(active?0xFFFFD579:Color.WHITE);paint.setStrokeWidth(2);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);paint.setStyle(Paint.Style.STROKE);Path p=new Path();
  switch(name){
   case "play":paint.setStyle(Paint.Style.FILL);p.moveTo(7,3);p.lineTo(21,12);p.lineTo(7,21);p.close();canvas.drawPath(p,paint);break;
   case "pause":paint.setStyle(Paint.Style.FILL);canvas.drawRoundRect(6,3,10,21,1,1,paint);canvas.drawRoundRect(15,3,19,21,1,1,paint);break;
   case "previous":case "next":if(name.equals("previous")){canvas.translate(24,0);canvas.scale(-1,1);}paint.setStyle(Paint.Style.FILL);p.moveTo(4,4);p.lineTo(16,12);p.lineTo(4,20);p.close();canvas.drawPath(p,paint);canvas.drawRoundRect(18,4,21,20,1,1,paint);break;
   case "shuffle":p.moveTo(3,5);p.cubicTo(11,5,12,19,21,19);p.moveTo(3,19);p.cubicTo(11,19,12,5,21,5);p.moveTo(18,2);p.lineTo(21,5);p.lineTo(18,8);p.moveTo(18,16);p.lineTo(21,19);p.lineTo(18,22);canvas.drawPath(p,paint);break;
   case "repeat":case "repeatOne":p.moveTo(20,8);p.lineTo(20,6);p.quadTo(20,3,17,3);p.lineTo(4,3);p.moveTo(7,0);p.lineTo(4,3);p.lineTo(7,6);p.moveTo(4,16);p.lineTo(4,18);p.quadTo(4,21,7,21);p.lineTo(20,21);p.moveTo(17,18);p.lineTo(20,21);p.lineTo(17,24);canvas.drawPath(p,paint);if(name.equals("repeatOne")){paint.setStyle(Paint.Style.FILL);paint.setTextSize(11);paint.setTypeface(Typeface.DEFAULT_BOLD);canvas.drawText("1",9,16,paint);}break;
   case "close":canvas.drawLine(6,6,18,18,paint);canvas.drawLine(18,6,6,18,paint);break;
   case "open":p.moveTo(8,4);p.lineTo(3,4);p.lineTo(3,21);p.lineTo(20,21);p.lineTo(20,16);p.moveTo(12,3);p.lineTo(21,3);p.lineTo(21,12);p.moveTo(21,3);p.lineTo(9,15);canvas.drawPath(p,paint);break;
   case "collapse":p.moveTo(5,15);p.lineTo(12,8);p.lineTo(19,15);canvas.drawPath(p,paint);break;
   default:p.moveTo(5,9);p.lineTo(12,16);p.lineTo(19,9);canvas.drawPath(p,paint);
  }canvas.restore();
 }
}
