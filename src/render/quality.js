// Quality tiers and the first-two-seconds frame-rate guard.
export const QUALITY = {
  low: { name: 'Low', pr: 1, shadows: false, shadowSize: 512, motes: false, aniso: 2 },
  med: { name: 'Medium', pr: 1.5, shadows: true, shadowSize: 1024, motes: true, aniso: 4 },
  high: { name: 'High', pr: 2, shadows: true, shadowSize: 2048, motes: true, aniso: 8 },
};
export const QUALITY_ORDER = ['low', 'med', 'high'];

export class FpsGuard {
  constructor(onSlow, { windowSec = 2, minFps = 28, warmup = 0.4 } = {}) {
    this.onSlow = onSlow; this.windowSec = windowSec; this.minFps = minFps; this.warmup = warmup;
    this.t = 0; this.frames = 0; this.done = false; this.armed = true; this.startT = 0;
  }
  // call every frame with dt in seconds (only counts frames while `active`)
  tick(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.t < this.warmup) return; // ignore shader compile hitches
    this.frames++;
    const elapsed = this.t - this.warmup;
    if (elapsed >= this.windowSec) {
      this.done = true;
      const fps = this.frames / elapsed;
      this.fps = fps;
      if (fps < this.minFps) this.onSlow(fps);
    }
  }
}
