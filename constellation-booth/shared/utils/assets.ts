/**
 * 자산 경로 해석. 단일 파일(standalone) 빌드에서는 빌드 스크립트가 window.__STANDALONE_ASSETS__ 에
 * 경로 → data: URL 매핑을 넣어 두므로 서버 없이(file://) 열어도 그림이 나온다.
 */
declare global {
  interface Window {
    __STANDALONE_ASSETS__?: Record<string, string>;
    __STANDALONE__?: boolean;
  }
}

export function isStandalone(): boolean {
  return window.__STANDALONE__ === true || window.location.protocol === "file:";
}

export function assetUrl(base: string, path: string): string {
  return window.__STANDALONE_ASSETS__?.[path] ?? `${base}${path}`;
}
