/** Lossless byte wrapper. PUP1/PUP2 geometry and timing are restored exactly. */
export function unpackPup(source) {
  'worklet';
  const bytes=source instanceof Uint8Array?source:new Uint8Array(source);
  if(bytes[0]!==80||bytes[1]!==85||bytes[2]!==80||bytes[3]!==90)return bytes;
  if(bytes.length<9)throw new Error('Truncated PUP container');
  const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true),mode=bytes[8];
  if(length>67108864||mode>4)throw new Error('Invalid PUP container');
  const data=new Uint8Array(length);let read=9,write=0;
  while(read<bytes.length&&write<length){const token=bytes[read++];if(token<128){const n=token+1;if(read+n>bytes.length||write+n>length)throw new Error('Invalid PUP literal');for(let i=0;i<n;i++)data[write++]=bytes[read++];}else{const n=(token&127)+3;if(write+n>length)throw new Error('Invalid PUP match');let offset=0,shift=0,part;do{if(read>=bytes.length||shift>14)throw new Error('Invalid PUP offset');part=bytes[read++];offset|=(part&127)<<shift;shift+=7;}while(part&128);if(!offset||offset>write)throw new Error('Invalid PUP offset');for(let i=0;i<n;i++){data[write]=data[write-offset];write++;}}}
  if(read!==bytes.length||write!==length)throw new Error('PUP length mismatch');
  if(mode===1||mode===2){const stride=mode===1?4:9;for(let i=stride;i<length;i++)data[i]^=data[i-stride];return data;}
  if(mode===3||mode===4){const stride=mode===3?4:9,out=new Uint8Array(length);let from=0;for(let lane=0;lane<stride;lane++)for(let at=lane;at<length;at+=stride)out[at]=data[from++];return out;}
  return data;
}
