/* One artwork, one scalar, one interruptible spring. No per-frame layout writes. */
(function(root){
  'use strict';
  root.AartiPlayerMotion = function(o){
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const panel=o.panel, mini=o.mini, art=o.art;
    const title=panel.querySelector('.now-meta'), top=panel.querySelector('.now-top');
    const controls=panel.querySelector('.now-ctrls'), seek=panel.querySelector('.seek');
    const out=panel.querySelector('.out-row'), queue=panel.querySelector('.queue-open');
    const surface=panel.querySelector('.now-surface');
    const backdrop=panel.querySelector('.now-bg'), light=panel.querySelector('.now-lit');
    const smallText=mini.querySelector('.meta'), smallButtons=[...mini.querySelectorAll('button')];
    let p=0, speed=0, goal=0, frame=0, paintFrame=0, last=0, geometry=null, drag=null, shown=false, ignoreClickUntil=0;
    const clamp=n=>Math.max(0,Math.min(1,n));
    function measure(){
      const a=o.miniSlot.getBoundingClientRect(), b=o.fullSlot.getBoundingClientRect();
      const m=smallText.getBoundingClientRect(), parent=title.offsetParent.getBoundingClientRect();
      const textLeft=parent.left+title.offsetLeft, textTop=parent.top+title.offsetTop;
      geometry={a,b,textX:m.left-textLeft,textY:m.top-textTop,sheetY:mini.getBoundingClientRect().top,travel:Math.max(240,a.top-b.top)};
    }
    function reveal(){
      if(shown)return;
      shown=true; panel.classList.add('open'); panel.setAttribute('aria-hidden','false');panel.inert=false;
      o.onOpen();
    }
    function paint(){
      if(!geometry)return;
      const {a,b,textX,textY,sheetY}=geometry;
      const offset=sheetY*(1-p);
      const x=a.left+(b.left-a.left)*p, y=a.top+(b.top-a.top)*p;
      const scale=(a.width+(b.width-a.width)*p)/320;
      art.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
      art.style.visibility=mini.hidden?'hidden':'visible';
      if(surface){surface.style.transform=`translate3d(0,${offset}px,0)`;surface.style.opacity="1";}
      backdrop.style.transform=`translate3d(0,${offset}px,0)`;backdrop.style.opacity=String(p);
      light.style.transform=`translate3d(-50%,calc(-50% + ${offset}px),0)`;light.style.opacity=String(p*.65);
      title.style.transform=`translate3d(${textX*(1-p)}px,${textY*(1-p)}px,0) scale(${.66+.34*p})`;
      title.style.opacity=String(clamp(p*4));
      smallText.style.opacity=String(1-clamp(p*4));
      for(const item of [top,seek,out,queue]){
        item.style.transform=`translate3d(0,${offset}px,0)`;
        item.style.opacity=String(clamp((p-.2)/.8));
      }
      controls.style.transform=`translate3d(0,${offset}px,0) scale(${.65+.35*p})`;
      controls.style.opacity=String(p);
      smallButtons.forEach(b=>{b.style.opacity=String(1-p);b.style.transform=`scale(${1-.2*p})`;});
      // Attribute updates aid accessibility/tests; they do not affect layout.
      panel.dataset.progress=p.toFixed(4);
      panel.style.pointerEvents=p>0?'auto':'none';
      mini.style.pointerEvents=p>=1?'none':'';
    }
    function settle(){
      p=goal;speed=0;frame=0;paint();
      if(p===0&&shown){
        shown=false;panel.classList.remove('open');panel.setAttribute('aria-hidden','true');panel.inert=true;o.onClosed();
      }
      if(p===1){mini.inert=true;}else{mini.inert=false;}
    }
    function stop(){if(frame)cancelAnimationFrame(frame);if(paintFrame)cancelAnimationFrame(paintFrame);frame=paintFrame=0;last=0;}
    function schedulePaint(){if(!paintFrame)paintFrame=requestAnimationFrame(()=>{paintFrame=0;paint();});}
    function tick(now){
      const dt=Math.min((now-last)/1000||1/60,.064);last=now;
      // Exact critically damped solution: identical response at 60/90/120 Hz.
      const omega=19, displacement=p-goal, c=speed+omega*displacement, decay=Math.exp(-omega*dt);
      p=clamp(goal+(displacement+c*dt)*decay);
      speed=(speed-omega*c*dt)*decay;paint();
      if(Math.abs(goal-p)<.0005&&Math.abs(speed)<.006){settle();return;}
      frame=requestAnimationFrame(tick);
    }
    function spring(to,velocity=0){
      stop();goal=to;speed=velocity;measure();mini.inert=false;
      if(to||p>0)reveal();
      if(media.matches){settle();return;}
      last=performance.now();frame=requestAnimationFrame(tick);
    }
    function down(e){
      // A new deliberate press is not the compatibility click of the last drag.
      ignoreClickUntil=0;
      if(o.onPress)o.onPress();
      if(e.button!==0||e.isPrimary===false||mini.hidden||drag)return;
      if(e.target.closest('button,input,a,.seek,.queue-open,.sheet'))return;
      if(o.canDrag&&!o.canDrag())return;
      stop();mini.inert=false;measure();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:p,lastY:e.clientY,lastTime:e.timeStamp,velocity:0,axis:null,host:e.currentTarget,goal};
    }
    function move(e){
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(!drag.axis){
        if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
        if(Math.abs(dx)>Math.abs(dy)*1.15){const to=drag.goal;drag=null;spring(to);return;}
        drag.axis='y';o.onGesture();reveal();
        try{drag.host.setPointerCapture(e.pointerId);}catch(_){}
      }
      e.preventDefault();
      const dt=Math.max(1,e.timeStamp-drag.lastTime);
      const velocity=-(e.clientY-drag.lastY)/dt*1000/geometry.travel;
      drag.velocity=drag.velocity*.25+Math.max(-5,Math.min(5,velocity))*.75;
      drag.lastY=e.clientY;drag.lastTime=e.timeStamp;
      p=clamp(drag.start-dy/geometry.travel);schedulePaint();
    }
    function end(e,cancelled){
      if(!drag||e.pointerId!==drag.id)return;
      const d=drag;drag=null;
      if(d.axis==='y'){
        ignoreClickUntil=performance.now()+450;
        o.onGestureEnd();
        const v=e.timeStamp-d.lastTime>100?0:d.velocity;
        const target=cancelled?(p>=.5?1:0):Math.abs(v)>.65?(v>0?1:0):(p>=.5?1:0);
        spring(target, cancelled?0:v);
      }else spring(d.goal);
    }
    [panel,mini,art].forEach(host=>{
      host.addEventListener('pointerdown',down);
      host.addEventListener('pointermove',move,{passive:false});
      host.addEventListener('pointerup',e=>end(e,false));
      host.addEventListener('pointercancel',e=>end(e,true));
      host.addEventListener('lostpointercapture',e=>{if(drag&&drag.host===e.target)end(e,true);});
      host.addEventListener('dragstart',e=>e.preventDefault());
      host.addEventListener('click',e=>{if(performance.now()<ignoreClickUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
    });
    art.addEventListener('click',()=>{if(p<.05)spring(1);});
    const resize=()=>{measure();paint();};
    addEventListener('resize',resize);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){drag=null;stop();settle();requestAnimationFrame(resize);}});
    if(window.visualViewport)visualViewport.addEventListener('resize',resize);
    new MutationObserver(resize).observe(mini,{attributes:true,attributeFilter:['hidden']});
    media.addEventListener('change',()=>{if(frame){stop();settle();}});
    panel.inert=true;measure();paint();
    return {open:()=>spring(1),close:()=>spring(0),refresh:resize,get progress(){return p;}};
  };
})(window);
