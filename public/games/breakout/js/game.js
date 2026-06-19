import { CFG, ROW_COLORS, ROW_SCORES, GOLD_COLOR, GOLD_SCORE, PU_TYPES, getLevelTheme } from './config.js';
import { initAudio, SND, startMusic, stopMusic, audioCtx, drone, bassLineOsc, setMusicEnabled, beep } from './audio.js';
import { game as G, clamp, randInt, randFloat, triggerShake, triggerFlash, addPopup } from './state.js';
import { initInput } from './input.js';
import { createBall, getBaseSpeed, resetBall, launchBall, buildBricks, spawnParticles, applyPowerUp, updateParticles, updatePopups, updateBrickEnterAnim, ballRectCollide } from './entities.js';

// ==================== CANVAS ====================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CFG.W;
canvas.height = CFG.H;

// Offscreen scanlines
const slCvs = document.createElement('canvas');
slCvs.width = CFG.W; slCvs.height = CFG.H;
const slCtx = slCvs.getContext('2d');
slCtx.fillStyle = 'rgba(0,0,0,0.06)';
for (let y = 0; y < CFG.H; y += 4) slCtx.fillRect(0, y, CFG.W, 2);

// ==================== STARS ====================
const stars=[];
for(let i=0;i<40;i++) stars.push({x:Math.random()*CFG.W,y:Math.random()*CFG.H,s:0.3+Math.random()*0.7,layer:Math.random()<0.5?0:1});
function drawStars(){
  for(const s of stars){
    const al=s.layer===0?0.15:0.3;
    const sz=s.layer===0?1:2;
    ctx.globalAlpha=al;ctx.fillStyle='#fff';
    ctx.fillRect(Math.floor(s.x),Math.floor(s.y),sz,sz);
  }
  ctx.globalAlpha=1;
}
function updateStars(dt){
  for(const s of stars){
    const speed=s.layer===0?3:6;
    s.y+=speed*dt; s.x+=Math.sin(G.gameTime+s.x)*0.5*dt;
    if(s.y>CFG.H){s.y=-2;s.x=Math.random()*CFG.W;}
  }
}

// Feature: low-health heartbeat
function clearBallHeartbeats(){
  G.ballHeartbeatTimers.forEach(hb=>clearInterval(hb.id));
  G.ballHeartbeatTimers=[];
}

// ==================== INIT ====================
function initLevel(){
  buildBricks(); G.powerups=[];
  G.effects={WIDE:0,SLOW:0,PIERCE:0};
  G.pad.w=CFG.PAD_W; G.pad.x=CFG.W/2;
  G.combo=0; G.comboTimer=0; G.invulnTimer=CFG.INVULN_DUR;
  G.boostEnergy=CFG.BOOST_ENERGY_MAX; G.boostMode=false;
  resetBall();
}
function startGame(){
  G.score=0;G.lives=CFG.LIVES;G.level=1;G.combo=0;G.comboTimer=0;
  G.particles=[];G.popups=[];G.rings=[];G.brickEnterAnim=0;
  clearBallHeartbeats();
  // Stop all audio before restart
  stopMusic();
  if(drone.osc){try{drone.osc.stop();drone.osc=null;drone.gain=null;}catch(e){}}
  // Reset ball heartbeat flags
  // (G.balls array is empty at this point)
  initLevel(); G.state='PLAYING';
}

// ==================== UPDATE ====================
let lastTime=0;

function update(dt){
  setMusicEnabled(G.state === 'PLAYING');
  G.gameTime+=dt;

  // Update stars always
  updateStars(dt);

  // Non-playing states
  if(G.state!=='PLAYING'){
    updateParticles(dt); updatePopups(dt);
    // Rings in non-playing states
    for(let i=G.rings.length-1;i>=0;i--){
      G.rings[i].life-=dt;
      if(G.rings[i].life<=0)G.rings.splice(i,1);
    }
    if(G.state==='LEVEL_CLEAR'){
      G.levelClearTimer-=dt;
      clearBallHeartbeats();
      if(G.levelClearTimer<=0){G.level++;G.particles=[];G.popups=[];initLevel();G.state='PLAYING';}
    }
    return;
  }

  // Shake
  if(G.shakeDur>0)G.shakeDur-=dt;
  if(G.flashDur>0)G.flashDur-=dt;

  // Boost mode: Hold Shift to accelerate (uses energy)
  const kbBoost=G.keys['Shift'];
  if(kbBoost&&G.boostEnergy>0){G.boostMode=true;}
  if(!kbBoost||G.boostEnergy<=0){G.boostMode=false;}

  // Energy system
  if(G.boostMode){
    G.boostEnergy-=CFG.BOOST_ENERGY_DRAIN*dt;
    if(G.boostEnergy<0)G.boostEnergy=0;
  } else {
    G.boostEnergy+=CFG.BOOST_ENERGY_REGEN*dt;
    if(G.boostEnergy>CFG.BOOST_ENERGY_MAX)G.boostEnergy=CFG.BOOST_ENERGY_MAX;
  }

  // Paddle speed with boost multiplier
  const padSpd=G.boostMode?CFG.PAD_SPEED*CFG.BOOST_PAD_SPEED_MULT:CFG.PAD_SPEED;

  if(G.keys['ArrowLeft']||G.keys['a']||G.keys['A']){G.useKeyboard=true;G.pad.x-=padSpd*dt;}
  if(G.keys['ArrowRight']||G.keys['d']||G.keys['D']){G.useKeyboard=true;G.pad.x+=padSpd*dt;}
  if(!G.useKeyboard&&G.state==='PLAYING')G.pad.x=G.mouseX;
  G.pad.x=clamp(G.pad.x,G.pad.w/2,CFG.W-G.pad.w/2);
  // Smooth width transition
  if(G.pad.w<G.pad.wTarget){G.pad.w=Math.min(G.pad.w+dt*200,G.pad.wTarget);}
  if(G.pad.w>G.pad.wTarget){G.pad.w=Math.max(G.pad.w-dt*200,G.pad.wTarget);}
  G.pad.glow=Math.max(0,G.pad.glow-dt*2);

  // Reset keyboard mode after 1.5s of no keyboard input
  if(G.useKeyboard&&!G.keys['ArrowLeft']&&!G.keys['ArrowRight']&&!G.keys['a']&&!G.keys['A']&&!G.keys['d']&&!G.keys['D']){
    G.resetKBTimer-=dt;
    if(G.resetKBTimer<=0){G.useKeyboard=false;G.resetKBTimer=0;G.mouseX=G.pad.x;}
  } else {
    G.resetKBTimer=1.5; // keep resetting while any key pressed
  }

  // Combo
  if(G.comboTimer>0){G.comboTimer-=dt;if(G.comboTimer<=0)G.combo=0;}

  // Effects
  for(const k of['WIDE','SLOW','PIERCE']){
    if(G.effects[k]>0){
      G.effects[k]-=dt;
      if(G.effects[k]<=0){
        G.effects[k]=0;
        if(k==='WIDE'){
          G.pad.w=CFG.PAD_W;
          G.pad.wTarget=CFG.PAD_W;
        }
        if(k==='PIERCE')G.balls.forEach(b=>b.pierce=false);
      }
    }
  }

  // Brick entrance
  if(G.brickEnterAnim>0){G.brickEnterAnim-=dt;updateBrickEnterAnim(dt);}

  // Feature: moving G.bricks animation (skip during entrance)
  if(G.brickEnterAnim<=0){
    for(const br of G.bricks){
      if(br.moving){
        br.y=br.baseY+Math.sin(G.gameTime*1.5+br.movePhase)*15;
      }
    }
  }

  // Invulnerability
  if(G.invulnTimer>0)G.invulnTimer-=dt;

  // Ball on paddle
  if(G.ballOnPaddle&&G.balls.length>0){
    G.balls[0].x=G.pad.x;
    G.balls[0].y=CFG.PAD_Y-CFG.PAD_H/2-CFG.BALL_R-2;
    G.balls[0].vx=0;G.balls[0].vy=0;G.balls[0].trail=[];
  } else {
    const sf=G.effects.SLOW>0?CFG.BALL_SLOW_RATIO:1;
    const boostMult=G.boostMode?CFG.BOOST_SPEED_MULT:1;
    const isPiercing=G.effects.PIERCE>0;

    for(let i=G.balls.length-1;i>=0;i--){
      const b=G.balls[i];
      b.x+=b.vx*sf*boostMult*dt; b.y+=b.vy*sf*boostMult*dt;

      // Trail
      b.trail.push({x:b.x,y:b.y});
      if(b.trail.length>8)b.trail.shift();

      // Walls
      if(b.x-CFG.BALL_R<0){b.x=CFG.BALL_R;b.vx=Math.abs(b.vx);SND.wall();}
      if(b.x+CFG.BALL_R>CFG.W){b.x=CFG.W-CFG.BALL_R;b.vx=-Math.abs(b.vx);SND.wall();}
      if(b.y-CFG.BALL_R<0){b.y=CFG.BALL_R;b.vy=Math.abs(b.vy);SND.wall();}

      // Falls below
      if(b.y-CFG.BALL_R>CFG.H+20){
        spawnParticles(b.x,b.y,G.effects.PIERCE>0?'#ff4444':'#aaa',30);
        G.balls.splice(i,1);continue;
      }

      // Paddle
      const pt=CFG.PAD_Y-CFG.PAD_H/2, pl=G.pad.x-G.pad.w/2;
      const pc=ballRectCollide(b.x,b.y,pl,pt,G.pad.w,CFG.PAD_H);
      if(pc.hit&&b.vy>0){
        const hp=clamp((b.x-G.pad.x)/(G.pad.w/2),-1,1);
        const ang=hp*Math.PI*0.38-Math.PI/2;
        const spd=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
        b.vx=Math.cos(ang)*spd; b.vy=Math.sin(ang)*spd;
        if(b.vy>0)b.vy=-b.vy;
        b.y=pt-CFG.BALL_R-1;
        G.pad.glow=1; SND.hit();
        // Color the ring based on hit position (visual feedback)
        const ringColor=hp>0.5?'#ff8800':hp<-0.5?'#4488ff':'#00ee77';
        G.rings.push({x:b.x, y:b.y, life:0.4, maxLife:0.4, color:ringColor});
      }

      // Min vertical speed (only if ball is fast enough)
      const spd2=b.vx*b.vx+b.vy*b.vy;
      const spd3=Math.sqrt(spd2);
      if(spd3>CFG.BALL_MIN_VY&&Math.abs(b.vy)<CFG.BALL_MIN_VY){
        const sg=b.vy>=0?1:-1;
        b.vy=sg*CFG.BALL_MIN_VY;
        const rem=Math.sqrt(Math.max(0,spd2-b.vy*b.vy));
        b.vx=b.vx>=0?rem:-rem;
      }

      // Bricks — use mark-and-sweep to avoid splice-in-loop bugs
      let brickHitThisFrame=false;
      let fc=0;
      const deadBricks=new Set();
      for(let j=G.bricks.length-1;j>=0;j--){
        if(deadBricks.has(j))continue;
        const br=G.bricks[j];
        if(br.y<br.targetY-1)continue;
        const bc=ballRectCollide(b.x,b.y,br.x,br.y,br.w,br.h);
        if(bc.hit){
          br.hp--; G.combo++; G.comboTimer=1.5; fc=G.combo; G.combo=Math.min(G.combo,100);

          if(br.hp<=0){
            deadBricks.add(j);
            const mult=Math.min(G.combo,10);
            // Bomb brick: mark adjacent G.bricks for death (no splice in loop)
            if(br.isBomb){
              triggerShake(0.25,15);
              spawnParticles(br.x+br.w/2,br.y+br.h/2,'#ff4400',20);
              SND.bomb();
              for(let k=G.bricks.length-1;k>=0;k--){
                if(deadBricks.has(k))continue;
                const nb=G.bricks[k];
                if(nb===br) continue;
                if(Math.abs(nb.row-br.row)<=1&&Math.abs(nb.col-br.col)<=1){
                  nb.hp--;
                  if(nb.hp<=0){
                    deadBricks.add(k);
                    spawnParticles(nb.x+nb.w/2,nb.y+nb.h/2,nb.color,8);
                    G.score+=(nb.gold?GOLD_SCORE*G.level:ROW_SCORES[nb.row])*mult;
                    addPopup(nb.x+nb.w/2,nb.y,G.combo>1?`💥 x${mult}`:'💥','#ff4400');
                  }
                }
              }
            }
            const pts=(br.gold?GOLD_SCORE*G.level:ROW_SCORES[br.row])*mult;
            G.score+=pts;
            spawnParticles(br.x+br.w/2,br.y+br.h/2,br.color,12);
            addPopup(br.x+br.w/2,br.y,G.combo>1?`+${pts} x${mult}`:`+${pts}`,br.color);
            triggerShake(0.1,30+Math.min(G.combo,5)*6);
            triggerFlash(br.color, G.combo>=5 ? 0.2 : 0.08);
            SND.brick(fc,br.row);
            if(Math.random()<CFG.PU_CHANCE){
              const pt2=PU_TYPES[randInt(0,PU_TYPES.length-1)];
              spawnParticles(br.x+br.w/2,br.y+br.h/2,'#ffffff',randInt(6,8));
              G.powerups.push({x:br.x+br.w/2,y:br.y+br.h/2,type:pt2,bob:Math.random()*Math.PI*2});
            }
          } else {
            SND.gold();
            spawnParticles(br.x+br.w/2,br.y+br.h/2,'#fff',4);
            triggerShake(0.06,12);
          }

          if(!(b.pierce||isPiercing)){
            if(bc.ny!==0)b.vy=bc.ny*Math.abs(b.vy);
            if(bc.nx!==0)b.vx=bc.nx*Math.abs(b.vx);
            b.x+=bc.nx*(bc.pen+1); b.y+=bc.ny*(bc.pen+1);
            brickHitThisFrame=true;
            break;
          }
        }
      }
      // Remove dead G.bricks in reverse index order (safe for splice)
      const deadArr=Array.from(deadBricks).sort((a,b)=>b-a);
      for(const idx of deadArr) G.bricks.splice(idx,1);
    }

    // No G.balls
    if(G.balls.length===0){
      G.lives--; SND.lose(); triggerShake(0.3,20); triggerFlash('#ff0000',0.3);
      G.combo=0;G.comboTimer=0;
      if(G.lives<=0){
        G.state='GAME_OVER';
        if(G.score>G.highScore){G.highScore=G.score;localStorage.setItem('breakout_hi',String(G.highScore));}
        // Stop drone on game over
        if(drone.osc){try{drone.osc.stop();drone.osc=null;drone.gain=null;}catch(e){}}
        stopMusic();
        clearBallHeartbeats();
      } else {
        G.pad.w=CFG.PAD_W; G.effects={WIDE:0,SLOW:0,PIERCE:0};
        resetBall(); G.invulnTimer=CFG.INVULN_DUR;
      }
    }

    // Level clear
    if(G.bricks.length===0&&G.state==='PLAYING'){
      // Clear any remaining power-ups
      G.powerups=[];
      // Rainbow starburst from center
      const cx=CFG.W/2, cy=CFG.H/3;
      for(let i=0;i<60;i++){
        const a=Math.random()*Math.PI*2;
        const s=150+Math.random()*300;
        G.particles.push({x:cx,y:cy,vx:Math.cos(a)*s,vy:Math.sin(a)*s-80,life:0.8+Math.random()*0.8,maxLife:1.6,color:`hsl(${Math.floor(Math.random()*360)},100%,60%)`,size:2+randInt(0,5)});
      }
      SND.clear(); G.state='LEVEL_CLEAR'; G.levelClearTimer=1.5;
    }
  }

  // Power-ups
  for(let i=G.powerups.length-1;i>=0;i--){
    const pu=G.powerups[i];
    pu.y+=CFG.PU_FALL*dt; pu.bob+=6*dt;
    if(pu.y+CFG.PU_SIZE/2>=CFG.PAD_Y-CFG.PAD_H/2&&
       pu.y-CFG.PU_SIZE/2<=CFG.PAD_Y+CFG.PAD_H/2&&
       pu.x+CFG.PU_SIZE/2>=G.pad.x-G.pad.w/2&&
       pu.x-CFG.PU_SIZE/2<=G.pad.x+G.pad.w/2){
      applyPowerUp(pu.type);
      addPopup(pu.x,pu.y-15,pu.type.name,pu.type.color);
      SND.pu(); G.pad.glow=1;
      G.powerups.splice(i,1); continue;
    }
    if(pu.y>CFG.H+CFG.PU_SIZE)G.powerups.splice(i,1);
  }

  // Rings
  for(let i=G.rings.length-1;i>=0;i--){
    G.rings[i].life-=dt;
    if(G.rings[i].life<=0)G.rings.splice(i,1);
  }

  updateParticles(dt); updatePopups(dt);

  // Feature: dynamic drone modulation based on G.combo
  if(drone.gain&&audioCtx){
    const mod=1+0.3*Math.sin(G.gameTime*Math.max(G.combo,1)*4);
    drone.gain.gain.value=0.02*mod;
  }
  // Feature: low-health heartbeat
  for(let i=G.balls.length-1;i>=0;i--){
    const b=G.balls[i];
    if(b.vy>0&&b.y>CFG.DANGER_ZONE_Y&&b.y<CFG.DANGER_ZONE_Y+50){
      if(!b._hbTriggered){
        b._hbTriggered=true;
        if(G.ballHeartbeatTimers.length<3){
          const id=setInterval(()=>{
            if(audioCtx) beep(60,0.1,0.03,'triangle');
          },800);
          G.ballHeartbeatTimers.push({id,b});
        }
      }
    }
  }
  // Clean up heartbeat timers for G.balls that are gone or recovered
  for(let i=G.ballHeartbeatTimers.length-1;i>=0;i--){
    const hb=G.ballHeartbeatTimers[i];
    const exists=G.balls.includes(hb.b);
    if(!exists){
      clearInterval(hb.id); G.ballHeartbeatTimers.splice(i,1);
    } else if(hb.b.vy<0){
      // Ball recovered (going up again)
      clearInterval(hb.id); G.ballHeartbeatTimers.splice(i,1);
      hb.b._hbTriggered=false;
    }
  }
}

// ==================== DRAW ====================
function drawPixelRect(x,y,w,h,c){
  x=Math.floor(x);y=Math.floor(y);
  ctx.fillStyle=c; ctx.fillRect(x,y,w,h);
  ctx.fillStyle='rgba(255,255,255,0.22)';
  ctx.fillRect(x,y,w,2);ctx.fillRect(x,y,2,h);
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.fillRect(x,y+h-2,w,2);ctx.fillRect(x+w-2,y,2,h);
}

// Draw brick with row-specific style (Feature: diverse top brick styles)
function drawBrickStyle(br,wx){
  const x=Math.floor(br.x+wx), y=Math.floor(br.y), w=br.w, h=br.h;
  // Base pixel rect
  drawPixelRect(br.x+wx,br.y,br.w,br.h,br.color);

  // Row-specific decorations
  const row=br.row;
  if(row===0){
    // Top row: diamond pattern (diagonal lines)
    ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(x+w*0.15,y+h*0.5);ctx.lineTo(x+w*0.5,y);ctx.lineTo(x+w*0.85,y+h*0.5);
    ctx.lineTo(x+w*0.5,y+h);ctx.closePath();ctx.stroke();
  } else if(row===1){
    // Second row: horizontal stripes
    ctx.fillStyle='rgba(0,0,0,0.12)';
    for(let sy=y+4;sy<y+h-2;sy+=4) ctx.fillRect(x+2,sy,w-4,1);
  } else if(row===2){
    // Third row: checkerboard
    ctx.fillStyle='rgba(0,0,0,0.08)';
    for(let cx=x+3;cx<x+w-3;cx+=8){
      for(let cy=y+3;cy<y+h-3;cy+=6){
        if(((cx-x)/8+(cy-y)/6)%2===0) ctx.fillRect(cx,cy,4,3);
      }
    }
  } else if(row===3){
    // Fourth row: diagonal hatch
    ctx.strokeStyle='rgba(0,0,0,0.1)';ctx.lineWidth=1;
    for(let i=-w;i<w;i+=6){
      ctx.beginPath();ctx.moveTo(x+i,y);ctx.lineTo(x+i+h,y+h);ctx.stroke();
    }
  } else if(row===4){
    // Bottom row: dotted pattern
    ctx.fillStyle='rgba(0,0,0,0.1)';
    for(let dx=x+4;dx<x+w-4;dx+=8){
      for(let dy=y+4;dy<y+h-4;dy+=6){
        ctx.fillRect(dx,dy,2,2);
      }
    }
  }
  // Subtle inner glow on every brick for depth
  ctx.fillStyle='rgba(255,255,255,0.06)';
  ctx.fillRect(x+2,y+1,w-4,2);
}
function drawText(t,x,y,c='#fff',sz=16,al='left'){
  ctx.font=`bold ${sz}px 'Courier New',monospace`;
  ctx.fillStyle=c; ctx.textAlign=al; ctx.textBaseline='top';
  ctx.fillText(t,Math.floor(x),Math.floor(y));
}
function drawPixelHeart(x,y,c){
  const h=[[0,1,1,0,0,1,1,0],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,0],[0,0,1,1,1,1,0,0],[0,0,0,1,1,0,0,0],[0,0,0,0,0,0,0,0]];
  ctx.fillStyle=c;
  for(let r=0;r<h.length;r++)for(let c2=0;c2<h[r].length;c2++)if(h[r][c2])ctx.fillRect(x+c2*2,y+r*2,2,2);
}
function drawOverlay(zh,en,c){
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(-5,-5,CFG.W+10,CFG.H+10);
  drawText(en,CFG.W/2+2,CFG.H/2-38,'rgba(0,0,0,0.5)',42,'center');
  drawText(en,CFG.W/2,CFG.H/2-40,c,42,'center');
  drawText(zh,CFG.W/2,CFG.H/2+16,'#ccc',20,'center');
}

function draw(){
  const sx=G.shakeDur>0?(Math.random()-0.5)*G.shakeInt*(G.shakeDur/0.3):0;
  const sy=G.shakeDur>0?(Math.random()-0.5)*G.shakeInt*(G.shakeDur/0.3):0;
  ctx.save(); ctx.translate(Math.round(sx),Math.round(sy));

  ctx.fillStyle=CFG.BG; ctx.fillRect(-5,-5,CFG.W+10,CFG.H+10);
  ctx.drawImage(slCvs,0,0);

  // Screen flash
  if(G.flashDur>0){
    ctx.globalAlpha=G.flashDur/0.3;
    ctx.fillStyle=G.flashColor;
    ctx.fillRect(-5,-5,CFG.W+10,CFG.H+10);
    ctx.globalAlpha=1;
  }

  // Stars background
  drawStars();

  // Danger zone
  if(G.balls.length>0&&!G.ballOnPaddle){
    const da=0.15+0.1*Math.sin(G.gameTime*4);
    ctx.strokeStyle=`rgba(255,30,30,${da.toFixed(2)})`;
    ctx.lineWidth=2; ctx.setLineDash([8,8]);
    ctx.beginPath();ctx.moveTo(0,CFG.DANGER_ZONE_Y);ctx.lineTo(CFG.W,CFG.DANGER_ZONE_Y);ctx.stroke();
    ctx.setLineDash([]);
  }

  // Overhead bridge line (classic Breakout style)
  ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(CFG.BRICK_LEFT-10,CFG.BRICK_TOP-6);ctx.lineTo(CFG.BRICK_LEFT+CFG.BRICK_COLS*(CFG.BRICK_W+CFG.BRICK_PAD)-CFG.BRICK_PAD+10,CFG.BRICK_TOP-6);ctx.stroke();

  // Bricks
  for(const br of G.bricks){
    let wx=0;
    if(br.hp<br.maxHp){
      wx=Math.sin(G.gameTime*8+br.x)*2;
    }
    // Feature: hidden brick visibility based on ball proximity
    if(br.hidden){
      let closestDist=9999;
      for(const b of G.balls){
        const dx=br.x+br.w/2-b.x, dy=br.y+br.h/2-b.y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<closestDist) closestDist=d;
      }
      const reveal=closestDist<80?(1-closestDist/80):0.22;
      ctx.globalAlpha=reveal;
    }
    // Draw brick with row-specific style
    drawBrickStyle(br,wx);
    // Overlays on top of style
    if(br.gold&&br.hp<CFG.GOLD_HITS){
      ctx.fillStyle='rgba(255,255,255,0.15)';
      ctx.fillRect(br.x+wx+3,br.y+3,br.w-6,br.h-6);
      ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(br.x+wx+br.w*0.3,br.y);ctx.lineTo(br.x+wx+br.w*0.5,br.y+br.h*0.6);ctx.lineTo(br.x+wx+br.w*0.7,br.y+br.h);ctx.stroke();
    }
    if(br.gold&&br.hp===CFG.GOLD_HITS){
      const sh=0.08+0.06*Math.sin(G.gameTime*5+br.x*0.05);
      ctx.fillStyle=`rgba(255,255,200,${sh.toFixed(3)})`;
      ctx.fillRect(br.x+wx,br.y,br.w,br.h);
    }
    // Feature 9: steel brick cracks
    if(br.isSteel){
      ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;
      if(br.hp<=2){
        ctx.beginPath();ctx.moveTo(br.x+wx+br.w*0.3,br.y);ctx.lineTo(br.x+wx+br.w*0.5,br.y+br.h*0.7);ctx.lineTo(br.x+wx+br.w*0.65,br.y+br.h);ctx.stroke();
      }
      if(br.hp<=1){
        ctx.beginPath();ctx.moveTo(br.x+wx+br.w*0.1,br.y+br.h*0.2);ctx.lineTo(br.x+wx+br.w*0.4,br.y+br.h*0.5);ctx.lineTo(br.x+wx+br.w*0.35,br.y+br.h);ctx.stroke();
        ctx.beginPath();ctx.moveTo(br.x+wx+br.w*0.7,br.y+br.h*0.1);ctx.lineTo(br.x+wx+br.w*0.55,br.y+br.h*0.5);ctx.stroke();
      }
    }
    // Bomb brick pulse
    if(br.isBomb){
      const pulse=0.15+0.08*Math.sin(G.gameTime*6+br.x*0.1);
      ctx.fillStyle=`rgba(255,100,0,${pulse.toFixed(2)})`;
      ctx.fillRect(br.x+wx,br.y,br.w,br.h);
    }
    if(br.hidden) ctx.globalAlpha=1;
  }

  // Power-ups
  for(const pu of G.powerups){
    const s=CFG.PU_SIZE,by2=Math.sin(pu.bob)*2;
    const px=pu.x-s/2, py=pu.y-s/2+by2;
    const ga=0.12+0.08*Math.sin(pu.bob*2);
    ctx.globalAlpha=ga; ctx.fillStyle=pu.type.color;
    ctx.fillRect(Math.floor(px-4),Math.floor(py-4),s+8,s+8);
    ctx.globalAlpha=1;
    drawPixelRect(px-1,py-1,s+2,s+2,'#222');
    drawPixelRect(px,py,s,s,pu.type.color);
    drawText(pu.type.label,pu.x,pu.y+by2-6,'#000',13,'center');
  }

  // Paddle
  const pl=G.pad.x-G.pad.w/2, pt=CFG.PAD_Y-CFG.PAD_H/2;
  if(G.pad.glow>0){ctx.globalAlpha=G.pad.glow*0.3;ctx.fillStyle=CFG.PAD_COLOR;ctx.fillRect(Math.floor(pl-4),Math.floor(pt-4),Math.ceil(G.pad.w+8),CFG.PAD_H+8);ctx.globalAlpha=1;}
  if(G.invulnTimer>0&&Math.sin(G.gameTime*12)>0)ctx.globalAlpha=0.5;
  drawPixelRect(pl,pt,G.pad.w,CFG.PAD_H,CFG.PAD_COLOR);
  ctx.fillStyle='rgba(255,255,255,0.15)';
  ctx.fillRect(Math.floor(pl+G.pad.w/2-1),Math.floor(pt+2),2,CFG.PAD_H-4);
  ctx.globalAlpha=1;

  // Balls + trails
  for(const b of G.balls){
    const ip=b.pierce||G.effects.PIERCE>0;
    // Combo fire G.particles (Feature: G.combo >= 5)
    if(G.combo>=5&&G.comboTimer>0){
      const al=clamp(G.comboTimer/0.5,0,1);
      for(let f=0;f<2;f++){
        G.particles.push({
          x:b.x+randFloat(-4,4), y:b.y,
          vx:randFloat(-20,20), vy:-80-Math.random()*60,
          life:0.5, maxLife:0.5,
          color:Math.random()>0.5?'#ffaa00':'#ff8800',
          size:2+randInt(0,2),
        });
      }
    }
    // Trail color: base depends on speed, modified by G.combo and boost
    const spd=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
    let trailBase;
    if(G.boostMode){
      trailBase='#ff4400'; // fiery orange-red for boost
    } else if(G.effects.SLOW>0){
      trailBase='#4488cc'; // blue for slow
    } else if(spd>350){
      trailBase='#ffaa44'; // warm orange for fast
    } else {
      trailBase='#8899bb'; // normal grey-blue
    }
    let trailColor=trailBase;
    if(G.combo>=3&&G.comboTimer>0){
      if(G.combo>=8) trailColor='#ff2200';
      else if(G.combo>=5) trailColor='#ff8800';
      else if(G.combo>=3) trailColor='#ffdd00';
    }
    const tc=ip?'#ff4444':trailColor;
    for(let t=0;t<b.trail.length;t++){
      const al=(t/b.trail.length)*0.25;
      ctx.globalAlpha=al;ctx.fillStyle=tc;
      const ts=CFG.BALL_R*2*(t/b.trail.length);
      ctx.fillRect(Math.floor(b.trail[t].x-ts/2),Math.floor(b.trail[t].y-ts/2),Math.ceil(ts),Math.ceil(ts));
    }
    ctx.globalAlpha=1;
    if(G.ballOnPaddle&&G.invulnTimer>0&&Math.sin(G.gameTime*12)<0)ctx.globalAlpha=0.4;
    ctx.fillStyle=ip?'#ff4444':CFG.BALL_COLOR;
    ctx.fillRect(Math.floor(b.x-CFG.BALL_R),Math.floor(b.y-CFG.BALL_R),CFG.BALL_R*2,CFG.BALL_R*2);
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillRect(Math.floor(b.x-CFG.BALL_R+1),Math.floor(b.y-CFG.BALL_R+1),2,2);
    ctx.globalAlpha=1;
    if(ip){
      ctx.globalAlpha=0.2+0.1*Math.sin(G.gameTime*8);ctx.fillStyle='#ff2222';
      ctx.fillRect(Math.floor(b.x-CFG.BALL_R-3),Math.floor(b.y-CFG.BALL_R-3),CFG.BALL_R*2+6,CFG.BALL_R*2+6);
      ctx.globalAlpha=1;
    }
    if(G.effects.SLOW>0&&!ip){
      // Blue glow for slow effect
      ctx.globalAlpha=0.15+0.1*Math.sin(G.gameTime*6);ctx.fillStyle='#4488ff';
      ctx.fillRect(Math.floor(b.x-CFG.BALL_R-2),Math.floor(b.y-CFG.BALL_R-2),CFG.BALL_R*2+4,CFG.BALL_R*2+4);
      ctx.globalAlpha=1;
    }
    if(G.boostMode&&!ip){
      // Fiery orange glow for boost effect
      ctx.globalAlpha=0.2+0.15*Math.sin(G.gameTime*10);ctx.fillStyle='#ff6600';
      ctx.fillRect(Math.floor(b.x-CFG.BALL_R-4),Math.floor(b.y-CFG.BALL_R-4),CFG.BALL_R*2+8,CFG.BALL_R*2+8);
      ctx.globalAlpha=1;
    }
  }

  // Ball-on-paddle hint
  if(G.ballOnPaddle&&G.state==='PLAYING'&&Math.sin(G.gameTime*5)>0){
    drawText('▲ 点击/空格 发球' + (G.isTouching ? ' · 双击加速' : ''),CFG.W/2,CFG.PAD_Y-50,'#aaffaa',14,'center');
  }

  // Mobile start hint
  if(G.state==='START'&&Math.sin(G.gameTime*4)>0){
    drawText('点击屏幕任意位置开始',CFG.W/2,CFG.H/2+52,'#aaa',14,'center');
  }

  // Impact G.rings
  for(const r of G.rings){
    const t=r.life/r.maxLife;
    const radius=(1-t)*40+5;
    const rc=r.color||'#00ee77';
    ctx.globalAlpha=t*0.6;ctx.strokeStyle=rc;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(r.x,r.y,radius,0,Math.PI*2);ctx.stroke();
  }
  ctx.globalAlpha=1;

  // Particles
  for(const p of G.particles){
    ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;
    ctx.fillRect(Math.floor(p.x-p.size/2),Math.floor(p.y-p.size/2),p.size,p.size);
  }
  ctx.globalAlpha=1;

  // Popups
  for(const p of G.popups){
    ctx.globalAlpha=clamp(p.life/0.4,0,1);
    drawText(p.text,p.x,p.y,p.color,13,'center');
  }
  ctx.globalAlpha=1;

  // HUD
  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(0,0,CFG.W,46);
  ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fillRect(0,45,CFG.W,1);
  drawText(`SCORE ${G.score}`,12,8,'#fff',16);
  drawText(`LV ${G.level}`,CFG.W/2,8,'#aaa',16,'center');
  for(let i=0;i<G.lives;i++)drawPixelHeart(CFG.W-28-i*24,10,'#ff4466');
  drawText(`HI ${G.highScore}`,12,28,'#555',11);

  // Boost energy bar
  const barX=12, barY=32, barW=80, barH=6;
  ctx.fillStyle='#333';ctx.fillRect(barX,barY,barW,barH);
  const barColor=G.boostMode?'#ff6600':(G.boostEnergy>50?'#00ff66':(G.boostEnergy>25?'#ffdd00':'#ff4444'));
  ctx.fillStyle=barColor;ctx.fillRect(barX,barY,barW*(G.boostEnergy/CFG.BOOST_ENERGY_MAX),barH);
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;
  ctx.strokeRect(barX,barY,barW,barH);
  drawText('BOOST',barX,barY-10,'#aaa',10);
  if(G.combo>1&&G.comboTimer>0){
    ctx.globalAlpha=Math.min(1,G.comboTimer/0.5);
    drawText(`COMBO x${G.combo}`,CFG.W/2,28,'#ffdd00',Math.min(14+G.combo*2,28),'center');
    ctx.globalAlpha=1;
  }
  let ex=12;
  if(G.effects.WIDE>0){drawText(`加宽 ${Math.ceil(G.effects.WIDE)}s`,ex,50,'#00ff66',11);ex+=90;}
  if(G.effects.SLOW>0){drawText(`减速 ${Math.ceil(G.effects.SLOW)}s`,ex,50,'#ffee00',11);ex+=90;}
  if(G.effects.PIERCE>0){drawText(`穿透 ${Math.ceil(G.effects.PIERCE)}s`,ex,50,'#ff4444',11);ex+=90;}

  // Overlays
  if(G.state==='START'){
    // Animated background G.bricks
    for(let i=0;i<12;i++){
      const bx=(G.gameTime*30+i*67)%CFG.W;
      const by2=120+Math.sin(G.gameTime*1.5+i*0.8)*200+i*25;
      ctx.globalAlpha=0.08+0.04*Math.sin(G.gameTime+i);
      ctx.fillStyle=ROW_COLORS[i%ROW_COLORS.length];
      ctx.fillRect(bx,by2,36,18);
    }
    ctx.globalAlpha=1;
    // Title glow
    const titleGlow=0.8+0.2*Math.sin(G.gameTime*3);
    ctx.globalAlpha=titleGlow;
    drawOverlay('打砖块','BREAKOUT','#00ff88');
    ctx.globalAlpha=1;
    drawText('点击 或 按任意键开始',CFG.W/2,CFG.H/2+80,'#aaa',15,'center');
    drawText('鼠标/方向键 移动 · 按住Shift加速球速与挡板 · 空格/点击 发球 · P 暂停',CFG.W/2,CFG.H/2+106,'#555',12,'center');
    for(let i=0;i<CFG.BRICK_COLS;i++){
      drawPixelRect(CFG.BRICK_LEFT+i*(CFG.BRICK_W+CFG.BRICK_PAD),CFG.H/2-60,CFG.BRICK_W,CFG.BRICK_H,ROW_COLORS[i%ROW_COLORS.length]);
    }
    const bx=CFG.W/2+Math.sin(G.gameTime*2)*40, by=CFG.H/2-95+Math.cos(G.gameTime*2.5)*10;
    ctx.fillStyle='#fff';ctx.fillRect(Math.floor(bx-CFG.BALL_R),Math.floor(by-CFG.BALL_R),CFG.BALL_R*2,CFG.BALL_R*2);
    drawText('道具说明',CFG.W/2,CFG.H/2+140,'#888',13,'center');
    let ly=CFG.H/2+162;
    for(const pu of PU_TYPES){
      drawPixelRect(CFG.W/2-90,ly,18,18,pu.color);
      drawText(pu.label,CFG.W/2-81,ly+2,'#000',11,'center');
      drawText(pu.name,CFG.W/2-60,ly+2,pu.color,12);
      ly+=24;
    }
  }
  if(G.state==='PAUSED'){drawOverlay('暂停','PAUSED','#ffdd00');drawText('点击 或 按 P 继续',CFG.W/2,CFG.H/2+80,'#aaa',15,'center');}
  if(G.state==='GAME_OVER'){
    // Red-tinted background
    const al=0.3+0.1*Math.sin(G.gameTime*4);
    ctx.globalAlpha=al;ctx.fillStyle='#ff0000';ctx.fillRect(0,0,CFG.W,CFG.H);
    ctx.globalAlpha=1;
    drawOverlay('游戏结束','GAME OVER','#ff2255');
    drawText(`最终得分: ${G.score}`,CFG.W/2,CFG.H/2+66,'#fff',18,'center');
    drawText(`到达关卡: ${G.level}`,CFG.W/2,CFG.H/2+92,'#aaa',14,'center');
    if(G.score>=G.highScore&&G.score>0&&Math.sin(G.gameTime*6)>0)drawText('★ 新纪录! ★',CFG.W/2,CFG.H/2+116,'#ffdd00',18,'center');
    drawText('点击 或 按空格重新开始',CFG.W/2,CFG.H/2+145,'#aaa',14,'center');
  }
  if(G.state==='LEVEL_CLEAR'){
    // Bright green flash
    const fl=G.levelClearTimer/1.5;
    ctx.globalAlpha=fl*0.4;ctx.fillStyle='#00ff88';ctx.fillRect(0,0,CFG.W,CFG.H);
    ctx.globalAlpha=1;
    drawOverlay(`第 ${G.level} 关 通过!`,`LEVEL ${G.level} CLEAR`,'#00ff88');
  }

  // Vignette overlay
  {
    const vg=ctx.createRadialGradient(CFG.W/2,CFG.H/2,CFG.H*0.35,CFG.W/2,CFG.H/2,CFG.H*0.82);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,0.45)');
    ctx.fillStyle=vg;ctx.fillRect(-5,-5,CFG.W+10,CFG.H+10);
  }

  // Boost indicator on paddle
  if(G.boostMode){
    const bGlow=0.3+0.2*Math.sin(G.gameTime*10);
    ctx.globalAlpha=bGlow;ctx.fillStyle='#ffaa00';
    const pl2=G.pad.x-G.pad.w/2, pt2=CFG.PAD_Y-CFG.PAD_H/2;
    ctx.fillRect(Math.floor(pl2-6),Math.floor(pt2-6),Math.ceil(G.pad.w+12),CFG.PAD_H+12);
    ctx.globalAlpha=1;
    // Boost text
    if(G.isTouching){
      drawText('BOOST',CFG.W/2,CFG.PAD_Y-25,'#ffaa00',12,'center');
    }
  }

  ctx.restore();
}

// ==================== LOOP ====================
function loop(now){
  if(!lastTime)lastTime=now;
  let dt=(now-lastTime)/1000; lastTime=now;
  dt=Math.min(dt,0.05);
  update(dt); draw();
  requestAnimationFrame(loop);
}
initInput(canvas, {startGame, launchBall});
requestAnimationFrame(loop);
