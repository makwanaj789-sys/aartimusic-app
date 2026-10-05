/* One interruptible spring for tap, pull and release. Rows retain native scrolling. */
window.AartiQueueMotion=function({el,rows,onOpen,onClosed}){
 const veil=document.createElement('div');veil.className='queue-veil';veil.setAttribute('aria-hidden','true');el.prepend(veil);
 const panel=el.querySelector('.sheet-in'),media=matchMedia('(prefers-reduced-motion: reduce)');
 let p=0,target=0,v=0,frame=0,last=0,height=1,drag=null,visible=false,suppress=false,animation=null,shade=null,curve=null;
 const clamp=x=>Math.max(0,Math.min(1,x));
 function measure(){height=panel.offsetHeight||innerHeight*.82;}
 function paint(){panel.style.transform=`translate3d(0,${(1-p)*height}px,0)`;veil.style.opacity=String(p);el.dataset.progress=p.toFixed(4);}
 function stop(){
  if(animation){p=curve(Math.min(420,Number(animation.currentTime)||0)/1000);paint();animation.onfinish=null;animation.cancel();shade.cancel();animation=shade=null;}
  cancelAnimationFrame(frame);frame=0;
 }
 function composite(){
  const start=p,velocity=v,omega=26;let duration=420;
  curve=t=>{const x=start-target,c=velocity+omega*x;return clamp(target+(x+c*t)*Math.exp(-omega*t));};
  for(let ms=80;ms<420;ms+=8){if(Math.abs(curve(ms/1000)-target)<.0006){duration=ms;break;}}
  const values=Array.from({length:51},(_,i)=>i===50?target:curve(duration*i/50/1000));
  animation=panel.animate(values.map((value,i)=>({offset:i/50,transform:`translate3d(0,${(1-value)*height}px,0)`})),{duration,easing:'linear',fill:'both'});
  shade=veil.animate(values.map((value,i)=>({offset:i/50,opacity:value})),{duration,easing:'linear',fill:'both'});
  shade.startTime=animation.startTime;
  animation.onfinish=()=>{const a=animation,b=shade;animation=shade=null;settle();a.cancel();b.cancel();};
 }
 function settle(){p=target;v=0;frame=0;paint();if(!p&&visible){visible=false;el.classList.remove('open');el.setAttribute('aria-hidden','true');el.inert=true;onClosed();}}
 function tick(now){const dt=Math.min(.064,(now-last)/1000||1/60);last=now;const x=p-target,c=v+20*x,decay=Math.exp(-20*dt);p=clamp(target+(x+c*dt)*decay);v=(v-20*c*dt)*decay;paint();if(Math.abs(p-target)<.0006&&Math.abs(v)<.008)settle();else frame=requestAnimationFrame(tick);}
 function to(value,velocity=0){stop();target=value;v=velocity;measure();if(value&&!visible){visible=true;el.classList.add('open');el.setAttribute('aria-hidden','false');el.inert=false;onOpen();}if(media.matches || (Math.abs(p-target)<.0006 && Math.abs(v)<.008)){settle();return;}if(panel.animate){composite();return;}last=performance.now();frame=requestAnimationFrame(tick);}
 function scrollMode(){rows.style.touchAction=rows.scrollTop<=1?'pan-down pinch-zoom':'pan-y pinch-zoom';}
 panel.addEventListener('pointerdown',e=>{suppress=false;if(e.button!==0||e.isPrimary===false||drag||e.target.closest('button,input,a'))return;const list=rows.contains(e.target);if(list&&rows.scrollTop>1)return;stop();measure();drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:p,lastY:e.clientY,time:e.timeStamp,velocity:0,locked:false,list,target};});
 panel.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dy=e.clientY-drag.y,dx=e.clientX-drag.x;if(!drag.locked){if(Math.max(Math.abs(dy),Math.abs(dx))<6)return;if(Math.abs(dx)>Math.abs(dy)||drag.list&&dy<0){const goal=drag.target;drag=null;to(goal);return;}drag.locked=true;try{panel.setPointerCapture(e.pointerId);}catch(_){} }if(e.cancelable)e.preventDefault();const velocity=-(e.clientY-drag.lastY)/Math.max(1,e.timeStamp-drag.time)*1000/height;drag.velocity=.25*drag.velocity+.75*Math.max(-5,Math.min(5,velocity));drag.lastY=e.clientY;drag.time=e.timeStamp;p=clamp(drag.start-dy/height);paint();});
 function end(e,cancel){if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(!d.locked){to(d.target);return;}suppress=true;const velocity=e.timeStamp-d.time>100?0:d.velocity;to(cancel?d.target:(Math.abs(velocity)>.55?(velocity>0?1:0):(p>.72?1:0)),cancel?0:velocity);}
 panel.addEventListener('pointerup',e=>end(e,false));panel.addEventListener('pointercancel',e=>end(e,true));panel.addEventListener('lostpointercapture',e=>{if(e.target===panel)end(e,true);});
 el.addEventListener('click',e=>{if(suppress){suppress=false;e.preventDefault();e.stopImmediatePropagation();}},true);
 // Clear drag-click suppression for the next intentional press, including Done/backdrop.
 el.addEventListener('pointerdown',()=>{suppress=false;},true);
 rows.addEventListener('scroll',scrollMode,{passive:true});
 addEventListener('resize',()=>{const running=!!animation||!!frame;stop();measure();paint();if(running)to(target);});media.addEventListener('change',()=>{if(media.matches){stop();settle();}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!drag){stop();settle();}});
 el.inert=true;measure();paint();scrollMode();return {open:()=>{scrollMode();to(1);},close:()=>to(0),scrollMode};
};
