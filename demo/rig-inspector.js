import {deformationPoints, inspectionModes} from '../src/inspection.js';
import {skeletonPoints} from '../src/skeleton.js';

const $ = id => document.getElementById(id);
const titles = {skeleton:'Named skeleton', deformation:'Deformation bindings', transforms:'Transform pivots', poses:'Vector pose banks'};
const number = value => Number(value.toPrecision(4));
const ns = 'http://www.w3.org/2000/svg';
function svgElement(tag, attrs, text) {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text != null) el.textContent = text;
  return el;
}
function options(select, items, chosen) {
  select.replaceChildren(...items.map(([value, label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; return option;
  }));
  if (items.some(([value]) => String(value) === String(chosen))) select.value = chosen;
}

/** A demo-only overlay: the animation pixels and core player are untouched. */
export class RigInspector {
  constructor(onChange) {
    this.onChange = onChange; this.enabled = false; this.version = 0;
    this.mode = 'deformation'; this.part = -1; this.control = 'all';
    this.panel = $('rig-inspector'); this.overlay = $('rig-overlay');
    $('rig-mode').addEventListener('change', () => { this.mode = $('rig-mode').value; this.part = -1; this.menus(); onChange(); });
    $('rig-part').addEventListener('change', () => { this.part = Number($('rig-part').value); this.control = 'all'; this.controllers(); onChange(); });
    $('rig-control').addEventListener('change', () => { this.control = $('rig-control').value; onChange(); });
  }
  setTarget(puppet, spec) {
    this.version++; this.abort?.abort(); this.puppet = puppet; this.spec = spec;
    this.data = null; this.pending = null; this.overlay.replaceChildren(); this.part = -1; this.control = 'all';
    this.toggle(this.enabled);
  }
  toggle(enabled) {
    this.enabled = enabled;
    this.panel.hidden = !enabled || !this.puppet;
    this.overlay.toggleAttribute('hidden', !enabled || !this.data);
    if (enabled && this.puppet && !this.data) void this.load();
  }
  async load() {
    if (this.pending || !this.spec) return;
    const version = this.version; this.abort = new AbortController();
    $('rig-status').textContent = 'Loading the stored rig data…';
    $('rig-inspector-tools').hidden = true;
    this.pending = true;
    try {
      const response = await fetch(this.spec.url, {signal:this.abort.signal});
      if (!response.ok) throw new Error('Rig data request failed: HTTP ' + response.status);
      const data = await response.json();
      if (version !== this.version) return;
      if (data.asset.sha256 !== this.spec.assetSha256) throw new Error('Rig data does not match this animation');
      this.data = data;
      const modes = inspectionModes(data);
      this.mode = modes.includes(this.spec.defaultMode) ? this.spec.defaultMode : modes[0];
      options($('rig-mode'), modes.map(mode => [mode, titles[mode]]), this.mode);
      $('rig-download').href = this.spec.url; $('rig-download').download = this.spec.filename;
      $('rig-inspector-tools').hidden = false;
      this.menus(); this.overlay.toggleAttribute('hidden', !this.enabled); this.onChange();
    } catch (error) {
      if (error.name !== 'AbortError' && version === this.version) $('rig-status').textContent = error.message;
    } finally { if (version === this.version) this.pending = null; }
  }
  menus() {
    if (!this.data) return;
    const parts = this.mode === 'deformation' ? this.data.parts.filter(p => p.kind === 'weighted' || p.kind === 'vertex-morph')
      : this.mode === 'poses' ? this.data.parts.filter(p => p.kind === 'pose-bank') : this.data.parts;
    $('rig-part-label').hidden = this.mode === 'skeleton';
    if (this.mode === 'transforms') {
      options($('rig-part'), [[-1,'All parts'], ...parts.map(p => [p.index,p.name])], this.part);
    } else {
      if (!parts.some(p => p.index === this.part)) this.part = (parts.find(p => /hand-left-ink|left-wing|wing-left|左翅/.test(p.name)) || parts[0])?.index ?? -1;
      options($('rig-part'), parts.map(p => [p.index,p.name]), this.part);
    }
    this.controllers();
  }
  controllers() {
    const part = this.data?.parts[this.part];
    $('rig-control-label').hidden = this.mode !== 'deformation' || !part?.binding;
    if (part?.binding) options($('rig-control'), [['all','All controls'], ...part.binding.pivots.map(n => [n,this.data.nodes[n].name])], this.control);
  }
  render({width, height, placement}) {
    if (!this.enabled || !this.data || !this.puppet) { this.overlay.setAttribute('hidden',''); return; }
    this.overlay.removeAttribute('hidden'); this.overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const unit = width / Math.max(180, this.overlay.clientWidth || width);
    const nodes = [], labelBoxes = [], project = p => ({x:placement.x+p.x*placement.k, y:placement.y+p.y*placement.k});
    const append = (tag, attrs, text) => { const el=svgElement(tag, attrs, text); nodes.push(el); return el; };
    const line = (a,b,color,opacity=1) => append('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':1.2*unit,opacity});
    const circle = (p,r,color,role,opacity=1) => append('circle',{cx:p.x,cy:p.y,r:r*unit,fill:color,stroke:'#fff','stroke-width':.7*unit,opacity,'data-role':role});
    const label = (point, text) => {
      const box = {x:point.x+7*unit,y:point.y-6*unit,w:Math.min(160,text.length*5)*unit};
      while (labelBoxes.some(b => box.x < b.x+b.w && box.x+box.w>b.x && Math.abs(box.y-b.y)<11*unit)) box.y -= 12*unit;
      labelBoxes.push(box); append('text',{x:box.x,y:box.y,fill:'#12646e','font-size':9*unit,'font-family':'system-ui',stroke:'#fff','stroke-width':2.5*unit,'paint-order':'stroke'},text);
    };
    const {data,puppet} = this, part = data.parts[this.part];
    if (this.mode === 'skeleton') {
      const points = skeletonPoints(puppet, data.skeleton), map = new Map(points.map(p=>[p.name,project(p)]));
      for (const p of points) {
        const at = map.get(p.name); if (map.has(p.parent)) line(map.get(p.parent),at,'#167d85');
        circle(at,3.5,'#167d85','joint'); label(at,p.label);
      }
      $('rig-status').textContent = data.summary.semanticJoints + ' explicitly mapped joints. Lines follow the supplied skeleton mapping.';
    } else if (this.mode === 'deformation' && part) {
      const points = deformationPoints(puppet, part.index);
      const pivot = this.control === 'all' ? -1 : part.binding?.pivots.indexOf(Number(this.control)) ?? -1;
      const weights = pivot < 0 ? [] : points.flatMap(p => p.weights.map(row => row[pivot]));
      const max = Math.max(1e-9,...weights.map(Math.abs));
      const style = (p,role) => {
        const value = pivot < 0 ? 1 : p.weights[role][pivot];
        return {color:value<0?'#c24f87':'#087c91',opacity:pivot<0?1:.12+.88*Math.min(1,Math.abs(value)/max)};
      };
      for (const p of points) {
        const anchor=project(p.anchor), incoming=project(p.incoming), outgoing=project(p.outgoing);
        const a=style(p,0), b=style(p,1), c=style(p,2);
        line(anchor,incoming,b.color,b.opacity*.65); line(anchor,outgoing,c.color,c.opacity*.65);
        circle(incoming,1.6,b.color,'handle',b.opacity); circle(outgoing,1.6,c.color,'handle',c.opacity);
        circle(anchor,2.8,a.color,'anchor',a.opacity);
      }
      const detail = pivot < 0 ? (part.binding ? part.binding.pivots.length+' bound controls' : 'directly animated vertices')
        : data.nodes[Number(this.control)].name+' · coefficient range '+number(Math.min(...weights))+' … '+number(Math.max(...weights));
      $('rig-status').textContent = part.name+' · '+points.length+' curve anchors · '+detail+'. Blue/pink show positive/negative influence. Occluded control points are included; morph controls are not all anatomical joints.';
    } else if (this.mode === 'transforms') {
      const used = new Set();
      const add = i => { while(i>=0&&!used.has(i)){used.add(i);i=data.nodes[i].parent;} };
      for (const p of this.part<0?data.parts:[part]) { add(p.node); for(const n of p.binding?.pivots||[])add(n); }
      const groups = new Map(), byNode = new Map(); let outside = 0;
      for (const index of used) {
        if (index === 0) continue;
        const at = project({x:puppet.rig.world[index*6+4],y:puppet.rig.world[index*6+5]});
        if (at.x<0||at.y<0||at.x>width||at.y>height){outside++;continue;}
        const key=Math.round(at.x*2)+','+Math.round(at.y*2);
        if(!groups.has(key))groups.set(key,{at,indices:[]}); groups.get(key).indices.push(index); byNode.set(index,groups.get(key));
      }
      for(const group of groups.values()){
        for(const index of group.indices){const parent=byNode.get(data.nodes[index].parent);if(parent&&parent!==group)line(parent.at,group.at,'#167d85',.5);}
        const dot=circle(group.at,3.5,'#167d85','pivot');
        dot.append(svgElement('title',{},group.indices.map(i=>data.nodes[i].name+' (#'+i+')').join(' · ')));
        const name=data.nodes[group.indices[0]].name;
        if (groups.size<=12 || this.part>=0) label(group.at,name+(group.indices.length>1?' +'+(group.indices.length-1):''));
      }
      $('rig-status').textContent = used.size+' stored transform nodes'+(outside?' · '+outside+' outside the view':'')+'. Coincident origins are grouped. These are actual rig pivots, including numeric morph controls.'+
        (groups.size>12 && this.part<0 ? ' Hover a pivot or select a part for its labels.' : '');
    } else if (this.mode === 'poses' && part) {
      const pose = puppet.rig.poseIndices[part.geometry];
      $('rig-status').textContent = data.summary.poseBanks+' vector pose banks · '+part.name+' · pose '+(pose+1)+' / '+part.poseCount+
        (data.summary.weightedParts || data.summary.animatedNodes ? '. Pose banks coexist with this file’s other rig data.' : '. This file switches vector poses; it has no skeletal or weighted deformation bindings.');
    }
    this.overlay.replaceChildren(...nodes);
  }
}
