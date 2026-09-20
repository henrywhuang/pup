import { durationOf, loadPup, renderCanvas } from './canvas.js';

/** Small optional clock for a Canvas. The low-level renderers also work alone. */
export class CanvasPlayer {
  static async load(canvas, url, options = {}) {
    return new CanvasPlayer(canvas, await loadPup(url, options), options);
  }
  constructor(canvas, puppet, { clip = null, onEnd = null } = {}) {
    this.canvas = canvas;
    this.puppet = puppet;
    this.clip = clip;
    this.onEnd = onEnd;
    this.time = 0;
    this.speed = 1;
    this.loop = false;
    this.playing = false;
    this.frame = 0;
    this.last = null;
    this.tick = now => {
      if (!this.playing) return;
      if (this.last != null) this.time += Math.min(0.1, (now - this.last) / 1000) * this.speed;
      this.last = now;
      const end = durationOf(this.puppet, this.clip);
      if (this.time >= end) {
        if (this.loop && end > 0) this.time %= end;
        else { this.time = end; this.playing = false; }
      }
      this.draw();
      if (this.playing) this.frame = requestAnimationFrame(this.tick);
      else this.onEnd?.(this.clip);
    };
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
  }
  resize(width = this.canvas.clientWidth || this.canvas.width, height = this.canvas.clientHeight || this.canvas.height, dpr = globalThis.devicePixelRatio || 1) {
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.draw();
  }
  draw() { renderCanvas(this.puppet, this.canvas, this.time, { clip: this.clip }); }
  play(clip = this.clip, { loop = false, speed = 1 } = {}) {
    durationOf(this.puppet, clip); // validate before changing playback
    if (!(speed > 0 && Number.isFinite(speed))) throw new Error('Playback speed must be positive');
    this.pause();
    this.clip = clip; this.loop = loop; this.speed = speed; this.time = 0;
    this.last = null; this.playing = true;
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.last = null;
  }
  seek(seconds) {
    if (!Number.isFinite(seconds)) throw new Error('PUP time must be finite');
    this.time = Math.min(durationOf(this.puppet, this.clip), Math.max(0, seconds));
    this.last = null; this.draw();
  }
  stop() { this.pause(); this.seek(0); }
  dispose() {
    this.pause();
    this.observer?.disconnect();
    const ctx = this.canvas.getContext('2d');
    ctx.resetTransform(); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
