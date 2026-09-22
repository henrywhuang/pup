import {decodePup} from './format.js';
import {createRig} from './rig.js';

/** PUC1: the supplied compact bird container, using built-in gzip decompression. */
export function decodeCompactPayload(bytes) {
const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
function need(n){if(at+n>bytes.length)throw Error('Truncated compact animation')}
const u8=()=>{need(1);return bytes[at++]};
const u16=()=>{need(2);const x=view.getUint16(at,true);at+=2;return x};
const u32=()=>{need(4);const x=view.getUint32(at,true);at+=4;return x};
const f32=()=>{need(4);const x=view.getFloat32(at,true);at+=4;return x};
function variable(){let x=0,shift=0,b;do{b=u8();x|=(b&127)<<shift;shift+=7;if(shift>35)throw Error('Invalid integer')}while(b&128);return x>>>0}
function signed(){const n=variable();return (n>>>1)^-(n&1)}
if(u8()!==1)throw Error('Unsupported compact animation version');
const staticLength=u32();need(staticLength);
let raw='';for(let i=0;i<staticLength;i+=8192)raw+=String.fromCharCode(...bytes.subarray(at+i,at+Math.min(staticLength,i+8192)));
at+=staticLength;
const art=decodePup(btoa(raw));
const clip=art.clock.clips[0],duration=clip.duration;
const times=Array.from({length:u16()},f32),linear=clip.eases.findIndex(e=>e[0]===0);
if(linear<0)throw Error('Missing linear interpolation');
const trackCount=u16(),bitmapLength=Math.ceil(times.length/8);
const restSlots=new Map();for(const g of art.geoms)if(g.verts)for(let k=0;k<g.verts.length;k++)restSlots.set(g.slot+k,[g.verts,k]);
for(let j=0;j<trackCount;j++){
const slot=u16(),twin=u16(),offset=f32(),exponent=u8()-128,prediction=u8();
const selected=[];
for(let k=0;k<bitmapLength;k++){const mask=u8();for(let b=0;b<8;b++)if(mask&(1<<b)){const i=k*8+b;if(i>=times.length)throw Error('Invalid time bit');selected.push(times[i])}}
if(!selected.length)throw Error('Empty animation track');
const values=[];let previous=0,delta=0;
for(let k=0;k<selected.length;k++){
const encoded=signed();
const q=k===0?encoded:prediction===2?previous+delta+encoded:previous+encoded;
delta=q-previous;previous=q;values.push(Math.fround(q*2**exponent));
}
const keys=selected.map((t,k)=>[t,values[k],linear]);
for(let k=selected.length-1;k>=0;k--){
const t=Math.fround(duration-selected[k]);
if(t>keys[keys.length-1][0])keys.push([t,values[k],linear]);
}
clip.tracks.push(new Float32Array([slot,twin===65535?-1:twin,offset,...keys.flat()]));
for(const [s,bias]of[[slot,0],[twin,offset]])if(restSlots.has(s)){const [verts,i]=restSlots.get(s);verts[i]=values[0]+bias}
}
if(at!==bytes.length)throw Error('Trailing compact animation data');
return art;
}
export async function parsePuc(input) {
let bytes;
if(typeof input==='string'){const raw=atob(input);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))}
else bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
if(bytes.length<5||String.fromCharCode(...bytes.subarray(0,4))!=='PUC1')throw Error('Not a PUC1 animation');
if(typeof DecompressionStream==='undefined')throw Error('This browser does not support built-in gzip decompression.');
const stream=new Blob([bytes.subarray(4)]).stream().pipeThrough(new DecompressionStream('gzip'));
const payload=new Uint8Array(await new Response(stream).arrayBuffer());
const art=decodeCompactPayload(payload);
return {art,rig:createRig(art),activeClip:null,revision:0};
}
