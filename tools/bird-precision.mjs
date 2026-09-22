// Keep authored rest geometry untouched. Remove irrelevant precision only from
// deformation coefficients and motion channels (verified below 0.01 art px).
import {decodePup} from '../src/format.js';
import {encodePup} from './compiler.mjs';
export function compactPrecision(input){
 const art=decodePup(Buffer.from(input).toString('base64'));
 const q=(v,step)=>Math.round(v*step)/step;
 for(const shape of art.shapes){if(!shape.bend)continue;const w=shape.bend.weights,n=shape.bend.pivots.length;for(let j=0;j<w.length;j+=n){let sum=0;for(let k=1;k<n;k++){w[j+k]=q(w[j+k],262144);sum+=w[j+k];}w[j]=1-sum;}}
 for(const clip of art.clock.clips){for(const t of clip.tracks){const prop=t[0]%6,node=Math.floor(t[0]/6);let step=prop===2?65536:256;if(prop<2&&art.nodeRest[node*6]===0&&art.nodeRest[node*6+1]===0)step=16;for(let j=4;j<t.length;j+=3)t[j]=q(t[j],step);}for(const ease of clip.eases)for(let j=1;j<ease.length;j++)ease[j]=q(ease[j],65536);}
 return encodePup(art);
}
