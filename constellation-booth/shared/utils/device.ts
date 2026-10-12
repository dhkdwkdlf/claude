/** 기기 보조 기능: Wake Lock, 전체화면, 동작 줄이기, 저사양 판정. 모두 실패해도 정상 동작한다. */

let wakeLock: { release(): Promise<void> } | null = null;

export async function requestWakeLock(): Promise<"ok" | "unsupported" | "failed"> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  if (!nav.wakeLock) return "unsupported";
  try {
    wakeLock = await nav.wakeLock.request("screen");
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible" && wakeLock === null) void requestWakeLock();
      },
      { once: false },
    );
    return "ok";
  } catch {
    wakeLock = null;
    return "failed";
  }
}

export function wakeLockActive(): boolean {
  return wakeLock !== null;
}

export async function requestFullscreen(): Promise<"ok" | "unsupported" | "failed"> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!fn) return "unsupported";
  try {
    await fn.call(el);
    return "ok";
  } catch {
    return "failed";
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** 저사양 추정: 메모리 2GB 이하, 논리 코어 4개 이하, 또는 저장 데이터 절약 모드 */
export function guessLowPerformance(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4) return true;
  if (nav.connection?.saveData) return true;
  return false;
}
