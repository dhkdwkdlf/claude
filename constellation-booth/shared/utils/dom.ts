/** 작은 DOM 도우미 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
  children: Array<Node | null | undefined> = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`요소를 찾을 수 없음: ${sel}`);
  return node;
}

/** 짧은 시간 안에 같은 요소를 n번 두드리면 콜백 (숨겨진 운영자 진입) */
export function onMultiTap(target: Element, count: number, windowMs: number, cb: () => void): void {
  let taps: number[] = [];
  target.addEventListener("pointerup", () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < windowMs);
    taps.push(now);
    if (taps.length >= count) {
      taps = [];
      cb();
    }
  });
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 화면 전환: 이전 화면 fade-out 후 다음 화면 표시 */
export async function switchScreen(from: HTMLElement | null, to: HTMLElement, durationMs: number): Promise<void> {
  if (from && from !== to) {
    from.classList.add("is-leaving");
    await wait(durationMs);
    from.hidden = true;
    from.classList.remove("is-leaving");
  }
  to.hidden = false;
  to.classList.add("is-entering");
  window.setTimeout(() => to.classList.remove("is-entering"), durationMs + 20);
}
