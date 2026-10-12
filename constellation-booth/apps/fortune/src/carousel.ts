/**
 * 12장 순환 캐러셀. position(실수 인덱스)을 따라 각 카드의 CSS 변수(--d, --ad)를 갱신한다.
 * 드래그 중에는 손가락을 따라가고, 놓으면 가장 가까운 카드로 스냅한다.
 */
export interface CarouselOptions {
  count: number;
  snapMs: number;
  onSettled(index: number): void;
}

export function wrapOffset(i: number, position: number, count: number): number {
  let d = i - position;
  d = ((d % count) + count) % count;
  if (d > count / 2) d -= count;
  return d;
}

export function nearestIndex(position: number, count: number): number {
  return (((Math.round(position) % count) + count) % count);
}

export class Carousel {
  position: number;
  private cards: HTMLElement[];
  private raf: number | null = null;
  private dragStartPos = 0;
  private spacing = 240;
  private settled = true;
  private opts: CarouselOptions;

  constructor(cards: HTMLElement[], opts: CarouselOptions, initialIndex = 0) {
    this.cards = cards;
    this.opts = opts;
    this.position = initialIndex;
    this.render(true);
  }

  setSpacing(px: number): void {
    this.spacing = px;
  }

  get currentIndex(): number {
    return nearestIndex(this.position, this.opts.count);
  }

  isSettled(): boolean {
    return this.settled;
  }

  render(settled: boolean): void {
    this.settled = settled;
    const n = this.opts.count;
    for (let i = 0; i < n; i++) {
      const d = wrapOffset(i, this.position, n);
      const ad = Math.abs(d);
      const card = this.cards[i];
      const visible = ad <= 2.6;
      card.style.setProperty("--d", d.toFixed(4));
      card.style.setProperty("--ad", ad.toFixed(4));
      card.style.visibility = visible ? "visible" : "hidden";
      card.style.zIndex = String(100 - Math.round(ad * 10));
      card.classList.toggle("is-center", settled && Math.round(d) === 0 && ad < 0.5);
      card.classList.toggle("is-settled", settled);
      card.setAttribute("aria-hidden", settled && ad < 0.5 ? "false" : "true");
    }
  }

  beginDrag(): void {
    this.cancelAnimation();
    this.dragStartPos = this.position;
    this.render(false);
  }

  dragTo(dx: number): void {
    this.position = this.dragStartPos - dx / this.spacing;
    this.render(false);
  }

  /** 드래그 종료: 가장 가까운 카드로 스냅. 임계값 이상 움직였으면 최소 한 장은 넘긴다. */
  endDrag(dx: number, _velocity: number, minSwipePx: number): void {
    let target = Math.round(this.position);
    const moved = this.position - this.dragStartPos;
    if (Math.abs(dx) >= minSwipePx && Math.round(moved) === 0) target = this.dragStartPos + Math.sign(moved);
    this.animateTo(target);
  }

  cancelDrag(): void {
    this.animateTo(Math.round(this.dragStartPos));
  }

  /** 특정 카드를 가장 짧은 방향으로 중앙에 */
  centerOn(index: number): void {
    const n = this.opts.count;
    const d = wrapOffset(index, this.position, n);
    this.animateTo(this.position + d);
  }

  private cancelAnimation(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  animateTo(target: number): void {
    this.cancelAnimation();
    const from = this.position;
    const dist = target - from;
    if (Math.abs(dist) < 0.001) {
      this.position = this.normalize(target);
      this.render(true);
      this.opts.onSettled(this.currentIndex);
      return;
    }
    const duration = this.opts.snapMs * Math.min(1.6, 0.6 + Math.abs(dist) * 0.5);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      this.position = from + dist * e;
      if (t < 1) {
        this.render(false);
        this.raf = requestAnimationFrame(step);
      } else {
        this.raf = null;
        this.position = this.normalize(target);
        this.render(true);
        this.opts.onSettled(this.currentIndex);
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  private normalize(p: number): number {
    const n = this.opts.count;
    return ((Math.round(p) % n) + n) % n;
  }
}
