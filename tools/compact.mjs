import {unpackPup} from '../src/compact.js';
const MAGIC=[80,85,80,90];
function transform(b,mode){if(!mode)return b;const out=new Uint8Array(b.length),stride=(mode===1||mode===3)?4:9;if(mode<3){for(let i=0;i<b.length;i++)out[i]=b[i]^(i>=stride?b[i-stride]:0);}else{let k=0;for(let p=0;p<stride;p++)for(let i=p;i<b.length;i+=stride)out[k++]=b[i];}return out;}
function compress(b){const dict=new Map(),tokens=[],literal=[];function flush(){if(literal.length){tokens.push(literal.length-1,...literal);literal.length=0;}}
 function key(i){return (b[i]|b[i+1]<<8|b[i+2]<<16)>>>0;}
 function add(i){if(i+2>=b.length)return;const k=key(i),q=dict.get(k)||[];q.push(i);if(q.length>24)q.shift();dict.set(k,q);}
 function best(i){if(i+2>=b.length)return[0,0];const q=dict.get(key(i));let len=0,offset=0;if(q)for(let z=q.length-1;z>=0;z--){const at=q[z],distance=i-at;if(distance>65535)continue;let n=3;while(n<130&&i+n<b.length&&b[at+n]===b[i+n])n++;if(n-(distance>16383?3:distance>127?2:1)>len-(offset>16383?3:offset>127?2:1)){len=n;offset=distance;if(n===130)break;}}return[len,offset];}
 let i=0;while(i<b.length){let [len,offset]=best(i);if(len>=3&&best(i+1)[0]>len+1)len=0;if(len>=3&&len>(offset>16383?3:offset>127?2:1)+1){flush();tokens.push(128+len-3);let distance=offset;do{let part=distance&127;distance>>>=7;tokens.push(part|(distance?128:0));}while(distance);for(let k=0;k<len;k++)add(i+k);i+=len;}else{literal.push(b[i]);add(i++);if(literal.length===128)flush();}}flush();return Uint8Array.from(tokens);}
export function packPup(raw){const bytes=raw instanceof Uint8Array?raw:new Uint8Array(raw),options=[];for(let mode=0;mode<=4;mode++){const data=compress(transform(bytes,mode));options.push({mode,data});}options.sort((a,b)=>a.data.length-b.data.length);const best=options[0],out=new Uint8Array(9+best.data.length);out.set(MAGIC);new DataView(out.buffer).setUint32(4,bytes.length,true);out[8]=best.mode;out.set(best.data,9);return {bytes:out,variants:options.map(o=>({mode:o.mode,bytes:o.data.length+9}))};}

export {unpackPup};
