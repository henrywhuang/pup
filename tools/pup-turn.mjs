/**
 * Authoring-only 2.5D turns. A semantic yaw track becomes ordinary PUP1
 * tx/sx/opacity tracks; mobile and web keep the exact same binary/runtime.
 * Rounded volumes retain width in profile, surface decals foreshorten,
 * offsets orbit around the turn axis, and authored side/back views reveal.
 */
const rad = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const distance = (a, b) => Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);

export function turnProjection(yaw, rest, spec) {
  const c = Math.cos(yaw * rad), s = Math.sin(yaw * rad);
  const min = spec.minScale ?? 0;
  const scale = min + (1 - min) * Math.abs(c);
  const sign = spec.mirror ? (c < 0 ? -1 : 1) : 1;
  const axis = spec.axisX ?? rest.tx;
  return { tx: axis + (rest.tx - axis) * c + (spec.depth ?? 0) * s,
    sx: rest.sx * scale * sign };
}

export function turnVisibility(yaw, spec) {
  if(spec.halfOpen && !(spec.feather??0)){
    const half=(spec.span??180)/2;
    return (spec.centers??[spec.center??0]).some(center=>{const a=((yaw-center+180)%360+360)%360-180;return a>=-half&&a<half;})?1:0;
  }
  const d = Math.min(...(spec.centers??[spec.center??0]).map(center=>distance(yaw,center))), half = (spec.span ?? 180) / 2;
  const feather = spec.feather ?? 0;
  if (!feather) return spec.exclusive ? (d < half ? 1 : 0) : (d <= half ? 1 : 0);
  return smooth((half + feather / 2 - d) / feather);
}

function curve(f, x1, y1, x2, y2) {
  let lo = 0, hi = 1, t = f;
  for (let i = 0; i < 24; i++) {
    const u = 1 - t, x = 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t;
    if (Math.abs(x-f)<1e-8) break;
    if (x < f) lo = t; else hi = t;
    t = (lo+hi)/2;
  }
  const u=1-t;return 3*u*u*t*y1+3*u*t*t*y2+t*t*t;
}

export function sampleYaw(keys, frame) {
  if(frame<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(frame<=keys[i][0]){
    const [a,x,e]=keys[i-1],[b,y]=keys[i];let f=(frame-a)/(b-a);
    if(e==='hold')f=frame===b?1:0;
    else if(e==='ease')f=curve(f,.42,0,.58,1);
    else if(e?.startsWith('cubic(')){const p=e.slice(6,-1).split(',').map(Number);if(p.length!==4||p.some(v=>!Number.isFinite(v)))throw new Error('turn: invalid cubic ease');f=curve(f,...p);}
    else if(e?.startsWith('elastic(')){const [amplitude,period]=e.slice(8,-1).split(',').map(Number);if(!(amplitude>0&&period>0))throw new Error('turn: invalid elastic ease');const amp=Math.max(1,amplitude),shift=period/(2*Math.PI)*Math.asin(1/amp);if(f>0&&f<1)f=amp*2**(-10*f)*Math.sin((f-shift)*2*Math.PI/period)+1;}
    else if(e!==undefined&&e!=='linear')throw new Error(`turn: unsupported ease ${e}`);
    return x+(y-x)*f;
  }
  return keys.at(-1)[1];
}

/** readRest(id) returns the SVG node's tx/sx/opacity, or throws for unknown IDs. */
export function expandTurns(source, readRest) {
  if(!source.turns)return source;
  const motion=structuredClone(source);
  for(const [controller,turn] of Object.entries(motion.turns)){
    const rate=turn.sampleRate??60;
    if(!(Number.isFinite(rate)&&rate>=12&&rate<=120))throw new Error(`turn ${controller}: sampleRate must be 12–120`);
    for(const p of turn.projections??[]){
      readRest(p.id);
      if(p.minScale!==undefined&&(!Number.isFinite(p.minScale)||p.minScale<0||p.minScale>1))throw new Error(`turn ${controller}: minScale must be 0–1`);
      for(const key of ['depth','axisX'])if(p[key]!==undefined&&!Number.isFinite(p[key]))throw new Error(`turn ${controller}: ${key} must be finite`);
    }
    for(const v of turn.views??[]){readRest(v.id);if(!(Number.isFinite(v.center??0)&&(v.span??180)>0&&(v.span??180)<=360&&(v.feather??0)>=0))throw new Error(`turn ${controller}: invalid view window`);}
    for(const clip of Object.values(motion.clips)){
      const keys=clip.tracks[controller]?.yaw;if(!keys)continue;
      if(!keys.length||keys.some((k,i)=>!Number.isFinite(k[0])||!Number.isFinite(k[1])||k[0]<0||(i>0&&k[0]<=keys[i-1][0])))throw new Error(`turn ${controller}: yaw keys must be finite and ordered`);
      if(!(clip.fps>0&&clip.frames>0)||clip.frames/clip.fps*rate>12000)throw new Error(`turn ${controller}: invalid or excessive clip duration`);
      const frames=new Set([0,clip.frames,...keys.map(k=>k[0])]);
      for(let f=0;f<clip.frames;f+=clip.fps/rate)frames.add(Number(f.toFixed(7)));
      const samples=[...frames].sort((a,b)=>a-b).map(f=>[f,sampleYaw(keys,f)]);
      delete clip.tracks[controller].yaw;
      if(!Object.keys(clip.tracks[controller]).length)delete clip.tracks[controller];
      const assign=(id,channel,values)=>{
        clip.tracks[id]??={};
        if(clip.tracks[id][channel])throw new Error(`turn ${controller}: ${id}.${channel} conflicts with an explicit track`);
        // Collapse constant spans while preserving endpoints and interpolation.
        const sparse=[];
        for(let i=0;i<values.length;i++)if(i===0||i===values.length-1||values[i][1]!==values[i-1][1]||values[i][1]!==values[i+1][1])sparse.push(values[i]);
        clip.tracks[id][channel]=sparse;
      };
      for(const p of turn.projections??[]){const rest=readRest(p.id),values=samples.map(([f,yaw])=>[f,turnProjection(yaw,rest,p)]);for(const channel of ['tx','sx'])assign(p.id,channel,values.map(([f,v])=>[f,Number(v[channel].toFixed(7))]));}
      for(const v of turn.views??[])assign(v.id,'opacity',samples.map(([f,yaw])=>v.feather?[f,Number(turnVisibility(yaw,v).toFixed(7))]:[f,turnVisibility(yaw,v),'hold']));
    }
  }
  delete motion.turns;return motion;
}
