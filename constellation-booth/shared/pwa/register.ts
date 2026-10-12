/**
 * 서비스 워커 등록과 오프라인 준비 상태 확인.
 * - 등록 실패(HTTP, file://, 미지원)여도 앱은 정상 동작한다. 상태만 운영자 화면에 보고한다.
 * - 갱신된 워커는 자동 적용하지 않는다. applyUpdate() 로 운영자가 적용한다.
 */
export interface OfflineStatus {
  supported: boolean;
  secureContext: boolean;
  registered: boolean;
  controlled: boolean;
  cacheName: string | null;
  total: number;
  cached: number;
  missing: string[];
  ready: boolean;
  updateWaiting: boolean;
  message: string;
}

let registration: ServiceWorkerRegistration | null = null;
let updateWaiting = false;
const listeners = new Set<() => void>();

export function onUpdateAvailable(fn: () => void): void {
  listeners.add(fn);
}

export async function registerServiceWorker(base: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" });
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          updateWaiting = true;
          listeners.forEach((fn) => fn());
        }
      });
    };
    track(registration.installing);
    registration.addEventListener("updatefound", () => track(registration?.installing ?? null));
    if (registration.waiting && navigator.serviceWorker.controller) {
      updateWaiting = true;
      listeners.forEach((fn) => fn());
    }
  } catch {
    registration = null;
  }
}

export async function checkForUpdate(): Promise<void> {
  try {
    await registration?.update();
  } catch {
    /* 오프라인이면 조용히 무시 */
  }
}

export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export async function getOfflineStatus(base: string): Promise<OfflineStatus> {
  const status: OfflineStatus = {
    supported: "serviceWorker" in navigator && "caches" in window,
    secureContext: window.isSecureContext,
    registered: !!registration,
    controlled: !!navigator.serviceWorker?.controller,
    cacheName: null,
    total: 0,
    cached: 0,
    missing: [],
    ready: false,
    updateWaiting,
    message: "",
  };
  if (!status.supported) {
    status.message = "이 브라우저는 오프라인 저장(서비스 워커)을 지원하지 않습니다.";
    return status;
  }
  if (!status.secureContext) {
    status.message = "HTTPS 또는 localhost 에서만 오프라인 설치가 됩니다. file:// 로 연 경우 설치되지 않습니다.";
    return status;
  }
  try {
    const res = await fetch(`${base}precache-manifest.json`, { cache: "no-store" });
    const manifest = (await res.json()) as { cacheName: string; files: string[] };
    status.cacheName = manifest.cacheName;
    const urls = [...manifest.files, `${base}precache-manifest.json`];
    status.total = urls.length;
    const cache = await caches.open(manifest.cacheName);
    for (const u of urls) {
      if (await cache.match(u)) status.cached += 1;
      else status.missing.push(u);
    }
    status.ready = status.registered && status.missing.length === 0;
    status.message = status.ready
      ? `오프라인 준비 완료 (${status.cached}/${status.total} 파일 저장됨)`
      : status.registered
        ? `설치 진행 중 또는 누락: ${status.cached}/${status.total} 저장됨. 네트워크가 켜진 상태에서 잠시 기다린 뒤 다시 확인하세요.`
        : "서비스 워커가 아직 등록되지 않았습니다. 페이지를 새로고침한 뒤 다시 확인하세요.";
  } catch (err) {
    status.message = `상태 확인 실패: ${(err as Error).message}`;
  }
  return status;
}
