let runtimePromise;

export function loadRiveRuntime(spec) {
  if (!runtimePromise) {
    runtimePromise = import(new URL(spec.js.url, document.baseURI).href).then(module =>
      module.default({
        locateFile: name => new URL(
          name.includes('fallback') ? spec.fallback.url : spec.wasm.url,
          document.baseURI,
        ).href,
      }),
    ).catch(error => { runtimePromise = null; throw error; });
  }
  return runtimePromise;
}

/** Original body and hand artboards, on the same deterministic clock as PUP. */
export class RiveReference {
  static async create(spec, runtimeSpec) {
    const runtime = await loadRiveRuntime(runtimeSpec);
    const bytes = await Promise.all([spec.body, spec.hand].map(async asset => {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error('Rive reference: HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const files = await Promise.all(bytes.map(bytes => runtime.load(bytes, undefined, false)));
    return new RiveReference(runtime, files, spec);
  }

  constructor(runtime, files, spec) {
    this.runtime = runtime;
    this.files = files;
    this.spec = spec;
    this.canvases = files.map(() => {
      const canvas = document.createElement('canvas');
      canvas.width = spec.width * 2;
      canvas.height = spec.height * 2;
      return canvas;
    });
    this.renderers = this.canvases.map(canvas => runtime.makeRenderer(canvas));
    this.instances = [];
    this.reset();
  }

  reset() {
    for (const item of this.instances) { item.machine.delete(); item.artboard.delete(); }
    this.instances = this.files.map(file => {
      const artboard = file.defaultArtboard();
      const definition = artboard.stateMachineByName('State Machine 1');
      if (!definition) throw new Error('Reference is missing State Machine 1');
      const machine = new this.runtime.StateMachineInstance(definition, artboard);
      machine.advanceAndApply(0);
      return { artboard, machine };
    });
    this.time = 0;
  }

  render(time) {
    if (time < this.time - 1e-7) this.reset();
    // Fixed substeps make state transitions repeatable when scrubbing backward.
    let remaining = Math.max(0, time - this.time);
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, 1 / 120);
      for (const item of this.instances) item.machine.advanceAndApply(dt);
      remaining -= dt;
    }
    this.time = time;
    this.instances.forEach((item, index) => {
      const renderer = this.renderers[index], canvas = this.canvases[index];
      renderer.clear(); renderer.save();
      renderer.align(this.runtime.Fit.contain, this.runtime.Alignment.center,
        { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }, item.artboard.bounds);
      item.artboard.draw(renderer);
      renderer.restore();
    });
    this.runtime.resolveAnimationFrame();
    return this.canvases;
  }

  dispose() {
    for (const item of this.instances) { item.machine.delete(); item.artboard.delete(); }
    for (const renderer of this.renderers) renderer.delete();
    for (const file of this.files) file.delete();
    this.instances = [];
    for (const canvas of this.canvases) { canvas.width = 1; canvas.height = 1; }
  }
}
