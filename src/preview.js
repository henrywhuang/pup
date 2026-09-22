import {parsePuc} from './puc.js';

/** Read the supplied self-contained preview without executing its JavaScript. */
export function previewData(html) {
  const match = html.match(/\bconst\s+encodedPuppet\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
  if (!match) throw new Error('No embedded PUP animation found in this preview');
  const marker = html.match(/\bmap\s*=\s*\{/);
  let metadata = null;
  if (marker) {
    const start = marker.index + marker[0].lastIndexOf('{');
    let depth = 0, quoted = false, escape = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { metadata = JSON.parse(html.slice(start, i + 1)); break; }
    }
  }
  const labelBlock = html.match(/\bconst\s+labels\s*=\s*(\{[^;]*\})/);
  if (metadata?.bones && labelBlock) {
    for (const pair of labelBlock[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*['"]([^'"]*)['"]/g))
      if (metadata.bones[pair[1]]) metadata.bones[pair[1]].label = pair[2];
  }
  return {encoded: match[1], metadata};
}

export async function parsePreview(html) {
  const {encoded, metadata} = previewData(html);
  const puppet = await parsePuc(encoded);
  if (metadata?.bones) puppet.skeleton = metadata.bones;
  return puppet;
}
