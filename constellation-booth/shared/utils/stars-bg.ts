/**
 * 저밀도 배경 별 캔버스. 정지 상태에서는 렌더링을 반복하지 않고, 페이지가 숨겨지면 멈춘다.
 * 반짝임은 느린 간격(약 8fps)으로만 갱신해 저사양에서도 부담이 없다.
 */
export interface StarsBackground {
  stop(): void;
  setLowPerformance(low: boolean): void;
}

interface BgStar {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

export function mountStarsBackground(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; lowPerformance: boolean }): StarsBackground {
  const ctx = canvas.getContext("2d");
  let stars: BgStar[] = [];
  let timer: number | null = null;
  let low = opts.lowPerformance;
  let dpr = 1;

  const layout = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const count = Math.round((w * h) / (low ? 26000 : 14000));
    const rng = mulberry32(20261104);
    stars = Array.from({ length: count }, () => ({
      x: rng() * w,
      y: rng() * h,
      r: 0.6 + rng() * 1.4,
      phase: rng() * Math.PI * 2,
      speed: 0.4 + rng() * 0.8,
    }));
    draw(0);
  };

  const draw = (t: number) => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      const tw = opts.reducedMotion ? 0.75 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.speed + s.phase);
      ctx.globalAlpha = 0.35 + 0.5 * tw;
      ctx.fillStyle = "#f7faff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const start = () => {
    if (timer !== null || opts.reducedMotion) return;
    timer = window.setInterval(() => draw(performance.now()), 125);
  };
  const pause = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  const onVisibility = () => (document.visibilityState === "visible" ? start() : pause());

  layout();
  start();
  window.addEventListener("resize", layout);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    stop() {
      pause();
      window.removeEventListener("resize", layout);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    setLowPerformance(v: boolean) {
      low = v;
      layout();
    },
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
