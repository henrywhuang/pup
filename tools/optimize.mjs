// Lossless PUP1 optimizations. The existing runtime already understands twin slots
// and shared geometry; this changes no byte format and needs no runtime patch.
import {decodePup} from '../src/format.js';
import {encodePup} from './compiler.mjs';
export function optimizePup(input, inspection = null) {
 const before=Buffer.from(input),art=decodePup(before.toString('base64'));
 // PUP2 already packs pose references; a compressed wrapper must stay compressed.
 if (before.subarray(0,4).toString() !== 'PUP1') {
  if (inspection) inspection.nodeMap=Array.from({length:art.nodeParent.length},(_,i)=>i);
  return before;
 }
 // A constant reset in a sparse clip is necessary when another clip changes
 // that channel, even when the reset value equals the authored rest pose.
 const changedSlots=new Set();
 for(const clip of art.clock.clips)for(const t of clip.tracks)for(let i=4;i<t.length;i+=3){
  if(t[0]<art.nodeRest.length&&t[i]!==art.nodeRest[t[0]])changedSlots.add(t[0]);
  if(t[1]>=0&&t[1]<art.nodeRest.length&&t[i]+t[2]!==art.nodeRest[t[1]])changedSlots.add(t[1]);
 }
 // Drop redundant constant endpoints. Clamping before/after a track makes
 // these keys exactly equivalent, rather than an approximation.
 for(const clip of art.clock.clips){const out=[];for(const t of clip.tracks){let keys=Array.from(t.slice(3));while(keys.length>3&&keys[1]===keys[4])keys.splice(0,3);while(keys.length>3&&keys[keys.length-2]===keys[keys.length-5])keys.splice(-3,3);const track=new Float32Array([...t.slice(0,3),...keys]);if(art.clock.clips.length===1&&keys.length===3&&track[0]<art.nodeRest.length&&(track[1]<0||track[1]<art.nodeRest.length)){art.nodeRest[track[0]]=keys[1];if(track[1]>=0)art.nodeRest[track[1]]=keys[1]+track[2];}else if(!(keys.length===3&&track[0]<art.nodeRest.length&&!changedSlots.has(track[0])&&!changedSlots.has(track[1])&&keys[1]===art.nodeRest[track[0]]&&(track[1]<0||keys[1]+track[2]===art.nodeRest[track[1]])))out.push(track);}clip.tracks=out;}
 for(const clip of art.clock.clips){const seen=new Map(),out=[];for(const track of clip.tracks){const key=Array.from(track.slice(3)).join(',');const prior=seen.get(key);if(prior&&prior[1]<0&&track[1]<0){prior[1]=track[0];prior[2]=0;seen.delete(key);}else{out.push(track);if(track[1]<0)seen.set(key,track);}}clip.tracks=out;}
 const geoms=[],mapping=[],known=new Map();for(const g of art.geoms){const key=g.verts?null:JSON.stringify([Array.from(g.verbs),Array.from(g.points)]);if(key&&known.has(key))mapping.push(known.get(key));else{const i=geoms.length;geoms.push(g);mapping.push(i);if(key)known.set(key,i);}}
 for(const shape of art.shapes)shape.geom=mapping[shape.geom];art.geoms=geoms;
 // Fold unanimated identity transform nodes into their parents and remap slots.
 const oldN=art.nodeParent.length,protectedNodes=new Set([0]);
 for(const clip of art.clock.clips)for(const t of clip.tracks)for(const slot of [t[0],t[1]])if(slot>=0&&slot<oldN*6)protectedNodes.add(Math.floor(slot/6));
 for(const shape of art.shapes){if(shape.follow)protectedNodes.add(shape.node);if(shape.bend)for(const n of shape.bend.pivots)protectedNodes.add(n);}
 const nodeMap=[],parents=[],rest=[];
 for(let n=0;n<oldN;n++){const r=Array.from(art.nodeRest.slice(n*6,n*6+6));const identity=r.every((v,i)=>v===[0,0,0,1,1,1][i]);if(n&&identity&&!protectedNodes.has(n)){nodeMap[n]=nodeMap[art.nodeParent[n]];}else{nodeMap[n]=parents.length;parents.push(art.nodeParent[n]<0?-1:nodeMap[art.nodeParent[n]]);rest.push(...r);}}
 const shift=(oldN-parents.length)*6;const remapSlot=slot=>slot<0?slot:slot<oldN*6?nodeMap[Math.floor(slot/6)]*6+slot%6:slot-shift;
 for(const shape of art.shapes){shape.node=nodeMap[shape.node];if(shape.bend)shape.bend.pivots=shape.bend.pivots.map(n=>nodeMap[n]);if(shape.follow)shape.follow.slot=remapSlot(shape.follow.slot);}
 for(const g of art.geoms)if(g.verts)g.slot=remapSlot(g.slot);
 for(const clip of art.clock.clips)for(const t of clip.tracks){t[0]=remapSlot(t[0]);t[1]=remapSlot(t[1]);}
 art.nodeParent=parents;art.nodeRest=new Float32Array(rest);art.slots-=shift;
 if (inspection) inspection.nodeMap=nodeMap;
 return encodePup(art);
}
