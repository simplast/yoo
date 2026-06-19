// ==================== AUDIO ====================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
export let audioCtx;
export function initAudio(){
  if(!audioCtx){audioCtx=new AudioCtx();}
  if(audioCtx.state==='suspended')audioCtx.resume();
}
export function beep(freq, dur, vol=0.10, type='square') {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+dur);
    o.onended=()=>{o.disconnect();g.disconnect();};
    o.stop(audioCtx.currentTime+dur);
  } catch(e){}
}
export const SND = {
  hit:()=>beep(520,0.05),
  brick:(n,row=0)=>{const types=['square','triangle','sawtooth'];beep(880+n*50,0.07,0.08,types[row%3]);},
  gold:()=>beep(660,0.06),
  wall:()=>beep(150+randInt(0,50),0.04,0.12,'triangle'),
  lose:()=>{beep(180,0.15,0.12,'sawtooth');setTimeout(()=>beep(120,0.25,0.10,'sawtooth'),180);},
  pu:()=>{beep(262,0.07);setTimeout(()=>beep(330,0.07),60);setTimeout(()=>beep(392,0.1),120);},
  clear:()=>{beep(262,0.08);setTimeout(()=>beep(294,0.08),90);setTimeout(()=>beep(330,0.08),180);setTimeout(()=>beep(392,0.08),270);setTimeout(()=>beep(523,0.14),360);},
  bomb:()=>{beep(80,0.3,0.15,'sawtooth');},
  launch:()=>{
    beep(600,0.04);
    if(!audioCtx) return;
    try {
      const bufSize=audioCtx.sampleRate*0.08;
      const buf=audioCtx.createBuffer(1,bufSize,audioCtx.sampleRate);
      const data=buf.getChannelData(0);
      for(let i=0;i<bufSize;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/(bufSize*0.2));
      const src=audioCtx.createBufferSource();
      src.buffer=buf;
      const g=audioCtx.createGain();
      g.gain.value=0.08;
      src.connect(g); g.connect(audioCtx.destination);
      src.start();
    } catch(e){}
  },
};

function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}

// Feature 4: Dynamic background drone (persistent oscillator)
export const drone = { osc: null, gain: null };
export let beatOsc=null, beatGain=null;
export let bassLineOsc=null, bassLineGain=null;

// ==================== RHYTHM MUSIC ====================
// Simple 8-bar chiptune rhythm loop
let musicInterval=null;
let musicBeat=0;
const BPM=128;
const BEAT_MS=Math.floor(60000/BPM);
const MELODY_NOTES=[
  // 8 beats melody (frequency, duration_ms)
  [523,  BEAT_MS*0.8], // C5
  [0,    BEAT_MS*0.2], // rest
  [659,  BEAT_MS*0.8], // E5
  [0,    BEAT_MS*0.2],
  [587,  BEAT_MS*0.8], // D5
  [0,    BEAT_MS*0.2],
  [523,  BEAT_MS*0.8], // C5
  [659,  BEAT_MS*1.0], // E5
];
const BASS_NOTES=[
  [131, BEAT_MS*0.9],  // C3
  [0,   BEAT_MS*0.1],
  [147, BEAT_MS*0.9],  // D3
  [0,   BEAT_MS*0.1],
  [165, BEAT_MS*0.9],  // E3
  [0,   BEAT_MS*0.1],
  [131, BEAT_MS*0.9],  // C3
  [0,   BEAT_MS*1.0],
];
const KICK_TIMES=[0,2,4,6]; // kick on beats 0,2,4,6
const HIHAT_TIMES=[0,1,2,3,4,5,6,7]; // hihat on every beat

let musicEnabled = false;
export function setMusicEnabled(enabled){ musicEnabled = enabled; }

export function startMusic(){
  if(!audioCtx) return;
  try {
    // Bass line
    bassLineOsc=audioCtx.createOscillator();
    bassLineGain=audioCtx.createGain();
    bassLineOsc.type='square';
    bassLineOsc.frequency.value=131;
    bassLineGain.gain.value=0.03;
    bassLineOsc.connect(bassLineGain);
    bassLineGain.connect(audioCtx.destination);
    bassLineOsc.start();

    // Start beat sequencer
    musicBeat=0;
    musicInterval=setInterval(()=>playMusicBeat(),BEAT_MS);
  } catch(e){}
}

export function stopMusic(){
  if(musicInterval){clearInterval(musicInterval);musicInterval=null;}
  if(bassLineOsc){try{bassLineOsc.stop();bassLineOsc=null;bassLineGain=null;}catch(e){}}
}

function playMusicBeat(){
  if(!musicEnabled||!audioCtx) return;
  const beat=musicBeat%8;
  musicBeat++;

  // Kick drum (simple noise burst)
  if(KICK_TIMES.includes(beat)){
    try {
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type='sine'; o.frequency.value=80;
      o.frequency.exponentialRampToValueAtTime(40,audioCtx.currentTime+0.08);
      g.gain.value=0.025;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.1);
      o.stop(audioCtx.currentTime+0.1);
    } catch(e){}
  }

  // Hihat (noise burst, shorter)
  if(HIHAT_TIMES.includes(beat)){
    try {
      const bufSize=audioCtx.sampleRate*0.02;
      const buf=audioCtx.createBuffer(1,bufSize,audioCtx.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<bufSize;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(bufSize*0.3));
      const src=audioCtx.createBufferSource();
      src.buffer=buf;
      const g=audioCtx.createGain();
      g.gain.value=0.006;
      src.connect(g); g.connect(audioCtx.destination);
      src.start();
    } catch(e){}
  }

  // Melody note
  const mel=MELODY_NOTES[beat];
  if(mel[0]>0){
    try {
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type='square'; o.frequency.value=mel[0];
      g.gain.value=0.025;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+mel[1]/1000*0.8);
      o.stop(audioCtx.currentTime+mel[1]/1000);
    } catch(e){}
  }

  // Bass note
  const bas=BASS_NOTES[beat];
  if(bas[0]>0&&bassLineOsc){
    try { bassLineOsc.frequency.value=bas[0]; } catch(e){}
  } else if(bassLineOsc){
    try { bassLineOsc.frequency.value=0; } catch(e){}
  }
}
