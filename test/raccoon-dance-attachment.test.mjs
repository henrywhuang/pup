import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePup, poseAt} from '../src/index.js';

function scene() {
  const base=new URL('../examples/dance/raccoon/',import.meta.url);
  const puppet=parsePup(fs.readFileSync(new URL('animation.pup',base)));
  const ids=[...fs.readFileSync(new URL('rig.svg',base),'utf8').matchAll(/<path id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,puppet.art.shapes.length);
  const index=id=>{const i=ids.indexOf(id);assert(i>=0,id);return i;};
  const shape=id=>puppet.art.shapes[index(id)];
  const points=id=>puppet.rig.points[shape(id).geom];
  return {puppet,ids,index,shape,points};
}
function local(m,x,y){const d=m[0]*m[3]-m[1]*m[2],a=x-m[4],b=y-m[5];return[(m[3]*a-m[2]*b)/d,(-m[1]*a+m[0]*b)/d];}
const near=(a,b,message)=>assert(Math.abs(a-b)<.002,message);

test('raccoon V5 preserves attached wrist curves and fully opaque arm unions',()=>{
  const {puppet,ids,points,shape}=scene(),references=new Map();
  for(let k=0;k<=1600;k++){
    const time=4.332*k/1600;poseAt(puppet,time,'dance');
    for(let i=0;i<ids.length;i++)if(ids[i].startsWith('hand-'))assert.equal(puppet.rig.fillColor[i]>>>24,255,'Every arm paint must remain opaque');
    for(const side of['left','right']){
      const bridge=points(`hand-${side}-complete`),palm=points(`hand-${side}-palm-fill`),ribbon=points(`hand-${side}-internal-overlap`);
      assert.equal(bridge.length,30);assert.equal(palm.length,48);assert.equal(ribbon.length,24);
      for(const[b,p]of[[18,0],[24,42],[22,2],[26,46]])for(let axis=0;axis<2;axis++)near(bridge[b+axis],palm[p+axis],`${side} shared wrist at ${time}`);
      for(const[g,p]of[[0,42],[12,0]])for(let axis=0;axis<2;axis++)near(ribbon[g+axis],palm[p+axis],`${side} tapered overlap endpoint at ${time}`);
      for(let axis=0;axis<2;axis++){
        near(ribbon[4+axis]-ribbon[axis],.5*(palm[46+axis]-palm[42+axis]),'Start overlap tangent');
        near(ribbon[14+axis]-ribbon[12+axis],.5*(palm[2+axis]-palm[axis]),'End overlap tangent');
      }
      if(time>.5&&time<3.9){
        const headNode=shape('head-脑袋').bend.pivots[0],m=puppet.rig.world.subarray(headNode*6,headNode*6+6),root=[...local(m,bridge[0],bridge[1]),...local(m,bridge[6],bridge[7])];
        if(!references.has(side))references.set(side,root);root.forEach((v,i)=>near(v,references.get(side)[i],`${side} shoulder attached to head`));
      }
    }
  }
});

function polygon(q){const out=[];for(let i=0;i<q.length;i+=6){const j=(i+6)%q.length;for(let k=0;k<14;k++){const t=k/14,u=1-t;out.push([0,1].map(a=>u**3*q[i+a]+3*u*u*t*q[i+4+a]+3*u*t*t*q[j+2+a]+t**3*q[j+a]));}}return out;}
function selfCrosses(p){const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];if(cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8)return true;}return false;}
test('raccoon V5 palms remain smooth, closed and stable in their own frame',()=>{
  const {puppet,points,shape}=scene(),reference=new Map();
  assert(puppet.art.clock.clips[0].tracks.every(t=>t[0]<puppet.art.nodeRest.length),'No vertex animation bank');
  for(let k=0;k<=800;k++){
    const time=4.332*k/800;poseAt(puppet,time,'dance');
    for(const side of['left','right']){
      const s=shape(`hand-${side}-palm-fill`),q=points(`hand-${side}-palm-fill`);
      assert.equal(s.clips.length,0);assert(puppet.art.geoms[s.geom].closed);
      assert(!selfCrosses(polygon(q)),`${side} palm self-intersection at ${time}`);
      for(let i=0;i<q.length;i+=6){const a=[q[i]-q[i+2],q[i+1]-q[i+3]],b=[q[i+4]-q[i],q[i+5]-q[i+1]],den=Math.hypot(...a)*Math.hypot(...b);if(den>.01)assert(Math.abs(a[0]*b[1]-a[1]*b[0])/den<.002,`${side} palm tangent at ${time}`);}
      if(time>.5&&time<3.9){const n=shape(`hand-${side}-complete`).bend.pivots[5],m=puppet.rig.world.subarray(n*6,n*6+6),p=[];for(let i=0;i<q.length;i+=2)p.push(...local(m,q[i],q[i+1]));if(!reference.has(side))reference.set(side,p);p.forEach((v,i)=>near(v,reference.get(side)[i],`${side} palm shape stays constant`));}
    }
  }
});
