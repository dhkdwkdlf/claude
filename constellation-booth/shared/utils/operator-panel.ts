/**
 * 운영자 패널 (두 앱 공통). 참가자 화면에는 노출하지 않고, 숨겨진 진입 동작 또는 #operator 로 연다.
 */
import { el } from "./dom.ts";
import { applyUpdate, checkForUpdate, getOfflineStatus, type OfflineStatus } from "../pwa/register.ts";
import { requestFullscreen, requestWakeLock, wakeLockActive } from "./device.ts";
import type { AutoFullscreen } from "./auto-fullscreen.ts";

export interface OperatorRow {
  label: string;
  control: HTMLElement;
  note?: string;
}

export interface OperatorSection {
  title: string;
  rows?: OperatorRow[];
  html?: string;
  statusText?: string;
  statusKind?: "ok" | "warn" | "plain";
}

export interface OperatorPanelOptions {
  appName: string;
  version: string;
  base: string;
  autoFullscreen?: AutoFullscreen;
  buildSections(): OperatorSection[];
  actions?: Array<{ label: string; onClick: () => void | Promise<void>; primary?: boolean }>;
  onClose?: () => void;
}

export function createOperatorPanel(opts: OperatorPanelOptions): { open(): void; close(): void; root: HTMLElement } {
  const root = el("div", { class: "operator", hidden: true, role: "dialog", "aria-label": "운영자 설정" });
  const panel = el("div", { class: "panel operator__panel" });
  root.append(panel);
  document.body.append(root);

  const statusBox = el("div", { class: "operator__status" });
  const fmtStatus = (s: OfflineStatus) => {
    statusBox.className = `operator__status ${s.ready ? "operator__status--ok" : "operator__status--warn"}`;
    const lines = [
      `앱 버전: ${opts.version}`,
      `오프라인 준비: ${s.ready ? "완료" : "미완료"}`,
      s.message,
      s.cacheName ? `캐시 이름: ${s.cacheName}` : "",
      s.missing.length ? `누락 파일(${s.missing.length}): ${s.missing.slice(0, 8).join(", ")}${s.missing.length > 8 ? " …" : ""}` : "",
      s.updateWaiting ? "새 버전이 내려받아져 대기 중입니다. 체험이 끝난 뒤 '업데이트 적용'을 누르세요." : "",
      `보안 컨텍스트(HTTPS/localhost): ${s.secureContext ? "예" : "아니오"}`,
      `현재 네트워크: ${navigator.onLine ? "연결됨" : "오프라인"}`,
    ].filter(Boolean);
    statusBox.textContent = "";
    for (const l of lines) statusBox.append(el("div", { text: l }));
  };

  const render = async () => {
    panel.textContent = "";
    const closeBtn = el("button", { class: "btn btn--small operator__close", type: "button", text: "닫기" });
    closeBtn.addEventListener("click", () => close());
    panel.append(closeBtn, el("h2", { text: `${opts.appName} 운영자 설정` }));
    panel.append(el("p", { text: "참가자에게는 보이지 않는 화면입니다. 설정은 이 태블릿에만 저장됩니다." }));

    panel.append(el("h3", { text: "오프라인 준비 상태" }));
    statusBox.textContent = "확인 중…";
    statusBox.className = "operator__status";
    panel.append(statusBox);
    const offlineActions = el("div", { class: "operator__actions" });
    const recheck = el("button", { class: "btn", type: "button", text: "다시 확인" });
    recheck.addEventListener("click", async () => {
      statusBox.textContent = "확인 중…";
      fmtStatus(await getOfflineStatus(opts.base));
    });
    const update = el("button", { class: "btn", type: "button", text: "업데이트 확인" });
    update.addEventListener("click", async () => {
      await checkForUpdate();
      fmtStatus(await getOfflineStatus(opts.base));
    });
    const apply = el("button", { class: "btn btn--primary", type: "button", text: "업데이트 적용(새로고침)" });
    apply.addEventListener("click", () => applyUpdate());
    offlineActions.append(recheck, update, apply);
    panel.append(offlineActions);

    panel.append(el("h3", { text: "화면" }));
    const screenActions = el("div", { class: "operator__actions" });
    const fs = el("button", { class: "btn", type: "button", text: "전체화면 요청" });
    fs.addEventListener("click", async () => {
      const r = await requestFullscreen();
      fs.textContent = r === "ok" ? "전체화면 켜짐" : r === "unsupported" ? "전체화면 미지원" : "전체화면 거부됨";
    });
    const wl = el("button", { class: "btn", type: "button", text: wakeLockActive() ? "화면 켜짐 유지 중" : "화면 켜짐 유지 요청" });
    wl.addEventListener("click", async () => {
      const r = await requestWakeLock();
      wl.textContent = r === "ok" ? "화면 켜짐 유지 중" : r === "unsupported" ? "미지원: 기기 설정에서 자동 잠금을 꺼 주세요" : "실패: 기기 설정에서 자동 잠금을 꺼 주세요";
    });
    screenActions.append(fs, wl);
    panel.append(screenActions);
    if (opts.autoFullscreen) {
      const auto = opts.autoFullscreen;
      const box = el("input", { type: "checkbox" }) as HTMLInputElement;
      box.checked = auto.enabled();
      box.addEventListener("change", () => auto.setEnabled(box.checked));
      const r = el("div", { class: "operator__row" });
      const label = el("label", { text: "자동 전체화면" });
      label.append(el("div", { text: "화면을 손가락으로 누르면 전체화면으로 바꿉니다. 풀려도 다음 터치에 다시 켜집니다. (마우스 클릭은 제외)", style: "font-size:14px;color:#6b7f9e" }));
      r.append(label, box);
      panel.append(r);
    }

    for (const section of opts.buildSections()) {
      panel.append(el("h3", { text: section.title }));
      if (section.statusText) {
        const kind = section.statusKind === "ok" ? " operator__status--ok" : section.statusKind === "warn" ? " operator__status--warn" : "";
        panel.append(el("div", { class: `operator__status${kind}`, text: section.statusText }));
      }
      if (section.html) panel.append(el("div", { html: section.html }));
      for (const row of section.rows ?? []) {
        const r = el("div", { class: "operator__row" });
        const label = el("label", { text: row.label });
        if (row.note) label.append(el("div", { text: row.note, style: "font-size:14px;color:#6b7f9e" }));
        r.append(label, row.control);
        panel.append(r);
      }
    }

    if (opts.actions?.length) {
      const acts = el("div", { class: "operator__actions" });
      for (const a of opts.actions) {
        const b = el("button", { class: `btn${a.primary ? " btn--primary" : ""}`, type: "button", text: a.label });
        b.addEventListener("click", () => void a.onClick());
        acts.append(b);
      }
      panel.append(acts);
    }

    fmtStatus(await getOfflineStatus(opts.base));
  };

  const open = () => {
    root.hidden = false;
    void render();
  };
  const close = () => {
    root.hidden = true;
    opts.onClose?.();
  };
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  return { open, close, root };
}
