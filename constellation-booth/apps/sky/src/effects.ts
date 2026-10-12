/** 정답 축하 효과: 별가루(캔버스, 최대 40개) + 짧은 유성(CSS). 조작을 잠그지 않고 1~2초 뒤 스스로 끝난다. */
import { mulberry32 } from "@shared/utils/stars-bg.ts";

export function burstStardust(canvas: HTMLCanvasElement, opts: { lowPerformance: boolean; reducedMotion: boolean }): void {
  if (opts.reducedMotion) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rng = mulberry32(Date.now() & 0xffff);
  const count = opts.lowPerformance ? 18 : 40;
  const particles = Array.from({ length: count }, () => {
    const angle = rng() * Math.PI * 2;
    const speed = 120 + rng() * 260;
    return {
      x: w / 2,
      y: h * 0.42,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      r: 2 + rng() * 3.5,
      life: 0.9 + rng() * 0.9,
      age: 0,
      gold: rng() > 0.35,
    };
  });
  let last = performance.now();
  const start = last;
  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of particles) {
      p.age += dt;
      if (p.age > p.life) continue;
      alive++;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.gold ? "#f2d79b" : "#dce8f8";
      drawStar(ctx, p.x, p.y, p.r);
    }
    ctx.globalAlpha = 1;
    if (alive > 0 && now - start < 2200 && document.visibilityState === "visible") requestAnimationFrame(step);
    else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(step);
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.3, y - r * 0.3);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.3, y + r * 0.3);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.3, y + r * 0.3);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.3, y - r * 0.3);
  ctx.closePath();
  ctx.fill();
}
