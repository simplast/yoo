import { CFG, ROW_SCORES, GOLD_COLOR, GOLD_SCORE, PU_TYPES, getLevelTheme } from './config.js';
import { SND, audioCtx, drone, startMusic } from './audio.js';
import { game as G, clamp, randInt, randFloat, triggerShake, addPopup } from './state.js';

// ==================== BALL ====================
export function createBall(x,y,angle,speed){
  return {x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,pierce:false,trail:[]};
}
export function getBaseSpeed(){return CFG.BALL_SPEED+(G.level-1)*15;}
export function resetBall(){
  G.ballOnPaddle=true;
  G.balls=[createBall(G.pad.x,CFG.PAD_Y-CFG.PAD_H/2-CFG.BALL_R-1,-Math.PI/2,getBaseSpeed())];
}
export function launchBall(){
  if(!G.ballOnPaddle)return;
  G.ballOnPaddle=false;
  const b=G.balls[0],speed=getBaseSpeed();
  const angle=-Math.PI/2+randFloat(-0.3,0.3);
  b.vx=Math.cos(angle)*speed; b.vy=Math.sin(angle)*speed;
  SND.launch();
  // Start drone on first launch
  if(!drone.osc&&audioCtx){
    drone.osc=audioCtx.createOscillator();
    drone.gain=audioCtx.createGain();
    drone.osc.type='sine'; drone.osc.frequency.value=60;
    drone.gain.gain.value=0.02;
    drone.osc.connect(drone.gain); drone.gain.connect(audioCtx.destination);
    drone.osc.start();
    startMusic();
  }
}

// ==================== BRICKS ====================
export function buildBricks(){
  G.bricks.length=0;
  const gc=Math.min(0.05+G.level*0.07,0.45);
  const theme=getLevelTheme(G.level);
  for(let r=0;r<CFG.BRICK_ROWS;r++){
    for(let c=0;c<CFG.BRICK_COLS;c++){
      // Feature 8: diamond on even levels
      if(G.level%2===0){
        const fromEdge=Math.min(r,CFG.BRICK_ROWS-1-r);
        if(fromEdge<=1&&(c<=fromEdge||c>=CFG.BRICK_COLS-1-fromEdge)) continue;
      }

      // Feature 9-10: brick types based on G.level
      const brickRand=Math.random();
      let isSteel=false, isBomb=false, isGold=Math.random()<gc;
      if(G.level>=2&&brickRand<0.10){
        isSteel=true; isGold=false;
      } else if(G.level>=3&&brickRand<0.17){
        isBomb=true; isGold=false;
      }

      // Feature 7: staircase shift on odd levels (clamped so G.bricks stay on screen)
      const shiftPerRow=8; // reduced from 12
      const totalShift=(CFG.BRICK_ROWS-1)*shiftPerRow; // max 32px
      const maxLeft=CFG.BRICK_LEFT;
      const scaleDown=(CFG.BRICK_COLS-1)*(CFG.BRICK_W+CFG.BRICK_PAD)+totalShift+CFG.BRICK_W+CFG.BRICK_LEFT > CFG.W
        ? (CFG.W - CFG.BRICK_LEFT - CFG.BRICK_W) / ((CFG.BRICK_COLS-1)*(CFG.BRICK_W+CFG.BRICK_PAD)+totalShift) : 1;
      const colStep=CFG.BRICK_W+CFG.BRICK_PAD;
      const rowShift=G.level%2===1?r*shiftPerRow:0;
      const px=CFG.BRICK_LEFT+c*colStep*scaleDown+rowShift*scaleDown;
      const py=CFG.BRICK_TOP+r*(CFG.BRICK_H+CFG.BRICK_PAD);

      // Color
      let color;
      if(isSteel) color='#888899';
      else if(isBomb) color='#ff2222';
      else if(isGold) color=GOLD_COLOR;
      else color=theme.rows[r];

      let hp=isSteel?3:(isGold?CFG.GOLD_HITS:1);

      G.bricks.push({
        x:px,y:py,targetY:py,w:CFG.BRICK_W,h:CFG.BRICK_H,row:r,col:c,
        gold:isGold,hp:hp,maxHp:hp,color:color,enterDelay:r*0.04+c*0.02,
        isSteel:isSteel,isBomb:isBomb,
        // Feature 7: moving brick (levels >= 3)
        moving: false, baseY: py, movePhase: 0,
        // Feature 8: hidden brick (levels >= 4)
        hidden: false,
      });
    }
  }
  G.brickEnterAnim=0.6;
  // Feature: moving G.bricks (G.level >= 3, ~1 in 8 normal G.bricks)
  if(G.level>=3){
    let placed=0;
    for(let i=G.bricks.length-1;i>=0&&placed<3;i--){
      const br=G.bricks[i];
      if(!br.gold&&!br.isSteel&&!br.isBomb&&!br.moving){
        br.moving=true; br.baseY=br.targetY; br.movePhase=Math.random()*Math.PI*2;
        placed++;
      }
    }
  }
  // Feature: hidden G.bricks (G.level >= 4, ~2 in 12 normal G.bricks)
  if(G.level>=4){
    let placed=0;
    for(let i=G.bricks.length-1;i>=0&&placed<4;i--){
      const br=G.bricks[i];
      if(!br.gold&&!br.isSteel&&!br.isBomb&&!br.hidden){
        br.hidden=true; placed++;
      }
    }
  }
}

// ==================== PARTICLES ====================
export function spawnParticles(x,y,color,count=10){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2, s=90+Math.random()*180;
    G.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,life:0.5+Math.random()*0.5,maxLife:1.0,color,size:2+randInt(0,4)});
  }
}

export function updateBrickEnterAnim(dt){
  for(const br of G.bricks){
    const t=clamp(1-(G.brickEnterAnim-br.enterDelay)/(0.6-br.enterDelay),0,1);
    const ease=t<1?t*t*(3-2*t):1;
    br.y=br.targetY-(1-ease)*60;
  }
}
export function updateParticles(dt){
  for(let i=G.particles.length-1;i>=0;i--){
    const p=G.particles[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=600*dt;
    p.vx*=Math.pow(0.5,dt*2); p.life-=dt;
    if(p.life<=0)G.particles.splice(i,1);
  }
}
export function updatePopups(dt){
  for(let i=G.popups.length-1;i>=0;i--){
    const p=G.popups[i]; p.y+=p.vy*dt; p.life-=dt;
    if(p.life<=0)G.popups.splice(i,1);
  }
}

export function applyPowerUp(type){
  // Spawn sparkle burst at paddle center
  spawnParticles(G.pad.x,CFG.PAD_Y-CFG.PAD_H,'#ffffff',randInt(8,12));
  spawnParticles(G.pad.x,CFG.PAD_Y-CFG.PAD_H,type.color,randInt(6,8));
  switch(type.id){
    case 'WIDE': G.pad.w=CFG.PAD_W_WIDE; G.effects.WIDE=CFG.PU_WIDE_DUR; break;
    case 'MULTI':
      if(G.balls.length>=10) break;
      if(G.ballOnPaddle){
        // Can't MULTI while on paddle — give extra life instead
        G.lives=Math.min(G.lives+1,9);
        addPopup(G.pad.x,CFG.PAD_Y-30,'加命','#ff66cc');
        break;
      }
      const nb=[];
      for(const b of G.balls){
        if(G.balls.length+nb.length>=10) break;
        const sp=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
        if(sp<10)continue; // skip stationary G.balls
        for(let a=0;a<2;a++){
          const ag=Math.atan2(b.vy,b.vx)+(a===0?0.5:-0.5);
          const ball=createBall(b.x,b.y,ag,sp); ball.pierce=b.pierce; nb.push(ball);
        }
      }
      G.balls.push(...nb); break;
    case 'SLOW': G.effects.SLOW=CFG.PU_SLOW_DUR; break;
    case 'PIERCE': G.effects.PIERCE=CFG.PU_PIERCE_DUR; G.balls.forEach(b=>b.pierce=true); break;
    case 'LIFE': G.lives=Math.min(G.lives+1,9); break;
  }
}

// ==================== COLLISION ====================
export function ballRectCollide(bx,by,rx,ry,rw,rh){
  const r=CFG.BALL_R;
  const cx=clamp(bx,rx,rx+rw), cy=clamp(by,ry,ry+rh);
  const dx=bx-cx, dy=by-cy;
  const d2=dx*dx+dy*dy;
  if(d2<r*r){
    const oL=(bx+r)-rx,oR=(rx+rw)-(bx-r);
    const oT=(by+r)-ry,oB=(ry+rh)-(by-r);
    const m=Math.min(oL,oR,oT,oB);
    let nx=0,ny=0;
    if(m===oT)ny=-1;else if(m===oB)ny=1;else if(m===oL)nx=-1;else nx=1;
    return{hit:true,nx,ny,pen:r-Math.sqrt(Math.max(d2,0.01))};
  }
  return{hit:false};
}
