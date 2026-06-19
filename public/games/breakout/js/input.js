import { CFG } from './config.js';
import { initAudio } from './audio.js';
import { game as G, clamp, addPopup } from './state.js';

let lastTouchX = null;
let lastTapTime = 0; // for double-tap boost detection

export function initInput(canvas, callbacks){
  const { startGame, launchBall } = callbacks;

  document.addEventListener('keydown',e=>{
    G.keys[e.key]=true;
    if(G.state==='START'){initAudio();startGame();return;}
    if(G.state==='GAME_OVER'&&(e.key===' '||e.key==='Enter')){startGame();return;}
    if((e.key==='p'||e.key==='P'||e.key==='Escape')&&G.state==='PLAYING'){G.state='PAUSED';return;}
    if((e.key==='p'||e.key==='P'||e.key==='Escape')&&G.state==='PAUSED'){G.state='PLAYING';return;}
    if(G.state==='PLAYING'&&G.ballOnPaddle&&(e.key===' '||e.key==='ArrowUp'||e.key==='w'||e.key==='W')){initAudio();launchBall();}
  });
  document.addEventListener('keyup',e=>{
    G.keys[e.key]=false;
  });

  // Mouse: track on document so re-entering canvas area works immediately
  function updateMouseX(clientX){
    const r=canvas.getBoundingClientRect(),sx=CFG.W/r.width;
    G.mouseX=clamp((clientX-r.left)*sx,0,CFG.W);
    G.useKeyboard=false;
    G.resetKBTimer=1.5;
  }
  document.addEventListener('mousemove',e=>updateMouseX(e.clientX));
  canvas.addEventListener('mouseleave',()=>{
    // Don't switch to keyboard mode — just keep last G.mouseX
    // Mouse re-entry via document mousemove will reactivate smoothly
  });
  // Click on canvas to ensure focus (fixes pointer-lock-like delay)
  canvas.addEventListener('mousedown',e=>{
    e.preventDefault();
    if(G.state==='START'){initAudio();startGame();return;}
    if(G.state==='GAME_OVER'){startGame();return;}
    if(G.state==='PAUSED'){G.state='PLAYING';return;}
    if(G.state==='PLAYING'&&G.ballOnPaddle){initAudio();launchBall();}
  });

  // Touch: full-screen drag control — any touch directly moves paddle
  function handleTouchMove(clientX){
    const r=canvas.getBoundingClientRect(),sx=CFG.W/r.width;
    const newX=clamp((clientX-r.left)*sx,0,CFG.W);
    if(lastTouchX!==null&&!G.boostMode){
      // Move paddle by the delta from last touch (relative drag)
      const delta=newX-lastTouchX;
      G.mouseX=clamp(G.pad.x+delta,G.pad.w/2,CFG.W-G.pad.w/2);
    } else {
      G.mouseX=newX;
    }
    lastTouchX=newX;
    G.useKeyboard=false;
  }

  // Listen on document for touches that start on canvas but drift outside
  document.addEventListener('touchmove',e=>{
    if(!G.isTouching)return;
    e.preventDefault();
    for(const touch of e.touches){
      handleTouchMove(touch.clientX);
    }
  },{passive:false});

  canvas.addEventListener('touchstart',e=>{
    e.preventDefault();
    initAudio();
    G.isTouching=true;
    G.useKeyboard=false;
    lastTouchX=null;

    const rect=canvas.getBoundingClientRect();
    const scaleX=CFG.W/rect.width, scaleY=CFG.H/rect.height;

    // Double-tap detection for boost mode
    const now=performance.now();
    if(now-lastTapTime<300){
      G.boostMode=G.boostEnergy>0;
      addPopup(CFG.W/2,CFG.H/2-40,G.boostMode?'加速启动!':'能量不足!',G.boostMode?'#ff6600':'#ff4444');
    }
    lastTapTime=now;

    for(const touch of e.changedTouches){
      const tx=(touch.clientX-rect.left)*scaleX;
      const ty=(touch.clientY-rect.top)*scaleY;

      // State transitions: tap anywhere on these screens
      if(G.state==='START'){startGame();return;}
      if(G.state==='GAME_OVER'){startGame();return;}
      if(G.state==='PAUSED'){G.state='PLAYING';return;}

      // Top 2/3 tap while playing: launch ball
      if(ty<CFG.H*0.66 && G.ballOnPaddle && G.state==='PLAYING'){launchBall();}

      // Set paddle position immediately on touch
      G.mouseX=clamp(tx,0,CFG.W);
      lastTouchX=G.mouseX;
    }
  },{passive:false});

  canvas.addEventListener('touchend',e=>{
    e.preventDefault();
    if(e.touches.length===0){
      G.isTouching=false;
      lastTouchX=null;
    } else {
      // Still have fingers down — update reference to remaining touch
      const touch=e.touches[0];
      const r=canvas.getBoundingClientRect(),sx=CFG.W/r.width;
      lastTouchX=clamp((touch.clientX-r.left)*sx,0,CFG.W);
    }
  },{passive:false});

  canvas.addEventListener('touchcancel',e=>{
    e.preventDefault();
    G.isTouching=false;
    lastTouchX=null;
  },{passive:false});
}
