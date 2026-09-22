/** Opt-in authoring optimizations. PUP1 bytes and runtime semantics stay unchanged. */
const TRANSFORM = new Set(['tx','ty','rotate','sx','sy','opacity']);

export function simplifyKeys(keys, tolerance) {
  if(keys.length<=2)return keys;
  const nonlinear=keys.slice(0,-1).some(k=>k[2]!==undefined&&k[2]!=='linear');
  if(nonlinear&&keys.some(k=>k[2]===undefined||k[2]==='linear')&&keys.every(k=>k[2]===undefined||k[2]==='linear'||k[2]==='hold')){
    // A final freeze must not disable reduction of the entire preceding
    // linear animation. Keep each hold boundary and simplify linear spans.
    const boundaries=new Set([0,keys.length-1]);
    keys.forEach((k,i)=>{if(k[2]==='hold'&&i<keys.length-1){boundaries.add(i);boundaries.add(i+1);}});
    const stops=[...boundaries].sort((a,b)=>a-b),out=[];
    for(let i=0;i<stops.length-1;i++){
      const segment=simplifyKeys(keys.slice(stops[i],stops[i+1]+1),tolerance);
      out.push(...(i?segment.slice(1):segment));
    }
    return out;
  }
  if(nonlinear){
    return keys.filter((k,i)=>i===0||i===keys.length-1||k[1]!==keys[i-1][1]||k[2]!=='hold'||keys[i-1][2]!=='hold');
  }
  if(keys.every(k=>k[1]===keys[0][1]))return [keys[0]];
  const keep=new Uint8Array(keys.length);keep[0]=keep[keys.length-1]=1;
  const stack=[[0,keys.length-1]];
  while(stack.length){const [a,b]=stack.pop();let worst=tolerance,index=-1;for(let i=a+1;i<b;i++){const fraction=(keys[i][0]-keys[a][0])/(keys[b][0]-keys[a][0]);const predicted=keys[a][1]+(keys[b][1]-keys[a][1])*fraction;const error=Math.abs(predicted-keys[i][1]);if(error>worst){worst=error;index=i;}}if(index>=0){keep[index]=1;stack.push([a,index],[index,b]);}}
  return keys.filter((_,i)=>keep[i]);
}

export function optimizeKeys(motion) {
  const options=motion.optimize;if(!options)return;
  for(const clip of Object.values(motion.clips))for(const channels of Object.values(clip.tracks))for(const [channel,keys]of Object.entries(channels)){
    const tolerance=channel==='opacity'?(options.opacityTolerance??.001):channel==='sx'||channel==='sy'?(options.scaleTolerance??.0008):channel==='rotate'||channel.endsWith('angle')?(options.angleTolerance??.25):(options.positionTolerance??.3);
    channels[channel]=simplifyKeys(keys,tolerance);
  }
}

function translatePath(d,dx,dy){
  const tokens=d.match(/[MCLZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)??[];let i=0;const out=[];
  while(i<tokens.length){const command=tokens[i++],n={M:2,L:2,C:6,Z:0}[command];if(n===undefined)throw new Error('PUP optimization requires absolute M/L/C/Z');out.push(command);for(let k=0;k<n;k++)out.push(String(Number(tokens[i++])+(k%2?dy:dx)));}
  return out.join(' ');
}

/** Static inverse pivot wrappers become child offsets. Plain path nodes reuse
 * their parent; animated/bind/follower nodes remain explicit and identifiable.
 */
export function flattenTranslations(root,motion,readTransform){
  if(!motion.optimize?.flattenTranslations)return;
  const protectedIds=new Set(['behind','front']);
  for(const clip of Object.values(motion.clips))for(const id of Object.keys(clip.tracks))protectedIds.add(id);
  (function collect(e){for(const id of (e.attrs['data-bend']??'').split(/\s+/))if(id)protectedIds.add(id);if(e.attrs['data-parent'])protectedIds.add(e.attrs['data-parent']);e.children.forEach(collect);})(root);
  const affineTarget=id=>Object.values(motion.clips).some(c=>Object.keys(c.tracks[id]??{}).some(p=>TRANSFORM.has(p)));
  function shiftTracks(id,dx,dy,vertices){for(const clip of Object.values(motion.clips))for(const [channel,keys]of Object.entries(clip.tracks[id]??{})){
    const offset=vertices?(/^v\d+\.x$/.test(channel)?dx:/^v\d+\.y$/.test(channel)?dy:0):channel==='tx'?dx:channel==='ty'?dy:0;
    if(offset)for(const key of keys)key[1]+=offset;
  }}
  function walk(element){
    const children=[];
    for(const child of element.children){
      const t=readTransform(child);
      const canRemove=child.tag==='g'&&!protectedIds.has(child.attrs.id)&&!child.attrs['data-parent']&&Number(child.attrs.opacity??1)===1&&t.rot===0&&t.sx===1&&t.sy===1&&!child.attrs['clip-path'];
      if(canRemove){
        for(const grand of child.children){
          // An attachment's coordinates belong to its named bone, not the
          // surrounding paint-order group.
          if(grand.attrs['data-parent'])continue;
          const g=readTransform(grand),dx=t.tx,dy=t.ty;
          if(grand.tag==='path'&&!affineTarget(grand.attrs.id)&&!grand.attrs['data-follow']&&g.rot===0&&g.sx===1&&g.sy===1){
            const x=dx+g.tx,y=dy+g.ty;grand.attrs.d=translatePath(grand.attrs.d,x,y);delete grand.attrs.transform;shiftTracks(grand.attrs.id,x,y,true);
            const bank=motion.poseBanks?.[grand.attrs.id];
            if(bank)for(const pose of bank.frames)for(const contour of pose)for(let k=0;k<contour.length;k+=2){contour[k]+=x;contour[k+1]+=y;}
            if(grand.attrs['data-bend-bind'])grand.attrs['data-bend-bind']=grand.attrs['data-bend-bind'].split(';').map(raw=>{const m=raw.trim().split(/\s+/).map(Number);m[4]-=m[0]*x+m[2]*y;m[5]-=m[1]*x+m[3]*y;return m.join(' ');}).join(';');
          }else{grand.attrs.transform=`translate(${g.tx+dx} ${g.ty+dy}) rotate(${g.rot*180/Math.PI}) scale(${g.sx} ${g.sy})`;shiftTracks(grand.attrs.id,dx,dy,false);}
        }
        walk(child);children.push(...child.children);
      }else{walk(child);children.push(child);}
    }
    element.children=children;
  }
  walk(root);
}

export function reuseParentNode(element,motion,readTransform){
  if(!motion.optimize?.flattenTranslations||element.attrs['data-follow']||element.attrs['data-parent'])return false;
  const t=readTransform(element);
  return t.tx===0&&t.ty===0&&t.rot===0&&t.sx===1&&t.sy===1&&Number(element.attrs.opacity??1)===1&&!Object.values(motion.clips).some(c=>Object.keys(c.tracks[element.attrs.id]??{}).some(p=>TRANSFORM.has(p)));
}

/** Existing PUP1 twin slots share an equal curve plus a constant offset.
 * This also makes a hand's transform and its arm endpoint share one track.
 */
export function shareTwinTracks(tracks){
  const used=new Uint8Array(tracks.length),out=[];
  for(let i=0;i<tracks.length;i++){
    if(used[i])continue;const a=tracks[i];
    if(a[1]<0)for(let j=i+1;j<tracks.length;j++){
      if(used[j])continue;const b=tracks[j];if(b[1]>=0||a.length!==b.length)continue;
      const delta=b[4]-a[4];let same=true;
      for(let k=3;k<a.length;k+=3)if(a[k]!==b[k]||a[k+2]!==b[k+2]||Math.abs(b[k+1]-a[k+1]-delta)>1e-7){same=false;break;}
      if(same){a[1]=b[0];a[2]=delta;used[j]=1;break;}
    }
    out.push(a);
  }
  return out;
}
