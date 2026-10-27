/**
 * 자동 전체화면: 손가락(터치·펜)으로 화면을 누를 때 전체화면이 아니면 다시 전체화면을 요청한다.
 * 브라우저는 사용자 동작 안에서만 전체화면을 허락하므로 pointerup 에서 요청한다.
 * 마우스 클릭은 건너뛰어 PC 시험 중에는 끼어들지 않는다. 운영자 화면에서 끌 수 있다.
 */
import type { SafeStorage } from "./storage.ts";
import { requestFullscreen } from "./device.ts";

const KEY = "autoFullscreen";

export interface AutoFullscreen {
  enabled(): boolean;
  setEnabled(on: boolean): void;
}

function isFullscreen(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  if (doc.fullscreenElement ?? doc.webkitFullscreenElement) return true;
  // 홈 화면 앱(PWA)이 이미 전체화면으로 실행된 경우
  return window.matchMedia?.("(display-mode: fullscreen)").matches ?? false;
}

export function installAutoFullscreen(storage: SafeStorage): AutoFullscreen {
  let on = storage.get<boolean>(KEY, true);
  let unsupported = false;
  let pending = false;

  document.addEventListener(
    "pointerup",
    (e) => {
      if (!on || unsupported || pending || e.pointerType === "mouse" || isFullscreen()) return;
      pending = true;
      void requestFullscreen().then((r) => {
        pending = false;
        if (r === "unsupported") unsupported = true;
      });
    },
    { capture: true, passive: true },
  );

  return {
    enabled: () => on,
    setEnabled(v) {
      on = v;
      storage.set(KEY, v);
    },
  };
}
