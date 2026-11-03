/**
 * 화면 자판 대응: 글자 입력 중 자판이 화면을 가리면 앱을 '보이는 부분' 크기로 줄인다.
 * - 뷰포트 메타 interactive-widget=resizes-content 를 지원하면 브라우저가 화면 높이를 직접 줄이고,
 * - 지원하지 않으면(visual viewport 만 줄어드는 경우) visualViewport 크기로 --app-h/--vv-top 을 맞춘다.
 * 자판이 열린 동안 <html> 에 is-kb-open(가로로 넓으면 is-kb-wide 도) 클래스를 붙여 CSS 가 배치를 바꾼다.
 */

const OPEN_RATIO = 0.82; // 보이는 높이가 평소의 82% 미만이면 자판이 열린 것으로 본다

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !["button", "submit", "checkbox", "radio", "range"].includes(el.type);
}

export function installKeyboardInset(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let baseH = window.innerHeight;
  let baseW = window.innerWidth;
  let frame = 0;

  const update = () => {
    frame = 0;
    const focused = isTextInput(document.activeElement);
    // 회전하면 기준을 새로 잡고, 입력 중이 아닐 때의 가장 큰 높이를 평소 높이로 삼는다
    if (Math.abs(window.innerWidth - baseW) > 80) {
      baseW = window.innerWidth;
      baseH = window.innerHeight;
    }
    if (!focused) baseH = Math.max(baseH, window.innerHeight);
    const visibleH = vv ? vv.height : window.innerHeight;
    const open = focused && visibleH < baseH * OPEN_RATIO;
    root.classList.toggle("is-kb-open", open);
    root.classList.toggle("is-kb-wide", open && window.innerWidth > visibleH * 1.2);
    if (open) {
      root.style.setProperty("--app-h", `${Math.round(visibleH)}px`);
      root.style.setProperty("--vv-top", `${Math.round(vv ? vv.offsetTop : 0)}px`);
      if (window.scrollY) window.scrollTo(0, 0);
    } else {
      root.style.removeProperty("--app-h");
      root.style.removeProperty("--vv-top");
      if (!focused) baseH = Math.max(baseH, window.innerHeight);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", () => setTimeout(schedule, 50));
}
