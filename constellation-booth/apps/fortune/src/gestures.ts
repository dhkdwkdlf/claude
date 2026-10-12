/**
 * Pointer Events 기반 제스처 판정: 탭과 드래그를 분리한다.
 * - 이동량 > tapSlop(10px) 이면 드래그, 좌우 이동이 우세할 때만 슬라이드로 인정한다.
 * - 드래그 후에는 click/tap 을 발생시키지 않는다.
 * - pointercancel 처리, 두 번째 포인터는 무시(연속 입력 충돌 방지).
 */
export interface GestureHandlers {
  onTap(target: Element | null, x: number, y: number): void;
  onDragStart(): void;
  onDragMove(dx: number): void;
  onDragEnd(dx: number, velocity: number): void;
  onDragCancel(): void;
}

export interface GestureOptions {
  tapSlop?: number;
  /** 세로 이동이 가로보다 크면 슬라이드로 보지 않는다 */
  requireHorizontal?: boolean;
}

export function attachGestures(root: HTMLElement, handlers: GestureHandlers, opts: GestureOptions = {}): () => void {
  const slop = opts.tapSlop ?? 10;
  let activeId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let rejected = false; // 세로 이동으로 판정되어 슬라이드로 인정하지 않음
  let target: Element | null = null;

  const down = (e: PointerEvent) => {
    if (activeId !== null) return; // 두 번째 손가락 무시
    if (e.button !== 0 && e.pointerType === "mouse") return;
    activeId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    dragging = false;
    rejected = false;
    target = e.target as Element;
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* 일부 브라우저 */
    }
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) <= slop && Math.abs(dy) <= slop) return;
      if (opts.requireHorizontal !== false && Math.abs(dy) > Math.abs(dx)) {
        rejected = true;
        return;
      }
      if (rejected) return;
      dragging = true;
      handlers.onDragStart();
    }
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = (e.clientX - lastX) / dt; // px/ms
    lastX = e.clientX;
    lastT = e.timeStamp;
    handlers.onDragMove(dx);
  };

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    if (dragging) {
      dragging = false;
      if (cancelled) handlers.onDragCancel();
      else handlers.onDragEnd(e.clientX - startX, velocity);
      return;
    }
    if (cancelled || rejected) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) <= slop && Math.abs(dy) <= slop) handlers.onTap(target, e.clientX, e.clientY);
  };

  const up = (e: PointerEvent) => finish(e, false);
  const cancel = (e: PointerEvent) => finish(e, true);

  root.addEventListener("pointerdown", down);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", cancel);
  root.addEventListener("lostpointercapture", cancel);
  // 드래그 후 발생하는 click 억제
  root.addEventListener("click", (e) => e.preventDefault(), true);

  return () => {
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerup", up);
    root.removeEventListener("pointercancel", cancel);
    root.removeEventListener("lostpointercapture", cancel);
  };
}
