/// <reference types="vite/client" />
import { IA_EXCLUSIONS, buildShellNav } from "./shell.ts";
import type { StateScreenViewModel } from "./state-gallery.ts";
import { buildStateScreens } from "./state-gallery.ts";

/**
 * Thin DOM mount for the A-01 acceptance gallery. Text-only rendering via
 * textContent (no innerHTML injection surface); keyboard reachable by native
 * buttons plus ArrowLeft/ArrowRight state switching. This is an acceptance
 * tool for the frozen state machine, not a component library (ADR-0028 D2).
 */
export function mountPrototype(root: HTMLElement): void {
  const screens = buildStateScreens();
  let currentIndex = 0;

  // A-02 real flow area (new/open project, Markdown import) backed by the
  // in-memory browser Host. That Host is explicitly "non-persistent, dev
  // wiring only" (PB-10 #5 / A-01-followups #3), and it drags host-contract's
  // Ajv validators into any bundle that statically imports it — so it is
  // mounted only in dev mode via dynamic import (dropped from production
  // builds entirely); production renders an honest pointer instead.
  const flowSection = document.createElement("section");
  root.append(flowSection);
  if (import.meta.env.DEV) {
    void mountBrowserFlow(flowSection);
  } else {
    const note = document.createElement("p");
    note.textContent =
      "项目与导入流程（A-02）：浏览器产物不含内存 Host（仅开发联调），请用 pnpm dev 或桌面壳体验真实流程。";
    flowSection.append(note);
  }

  const title = document.createElement("h1");
  title.textContent = "文枢 Alpha UX 冻结原型（A-01）";
  root.append(title);

  const navHeading = document.createElement("h2");
  navHeading.textContent = "信息架构（ux-spec §3 上限，八项）";
  const navList = document.createElement("ul");
  for (const area of buildShellNav()) {
    const item = document.createElement("li");
    item.textContent = `${area.label} — ${area.note}`;
    navList.append(item);
  }
  const exclusions = document.createElement("p");
  exclusions.textContent = `明确排除（ux-spec §3）：${IA_EXCLUSIONS.join("、")}`;
  root.append(navHeading, navList, exclusions);

  const galleryHeading = document.createElement("h2");
  galleryHeading.textContent = "核心状态矩阵（ux-spec §4，十二行逐行原型）";
  root.append(galleryHeading);

  const switcher = document.createElement("div");
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "状态切换");
  const screenContainer = document.createElement("section");
  root.append(switcher, screenContainer);

  const buttons = screens.map((screen, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${screen.uxSpecRow}. ${screen.label}`;
    button.addEventListener("click", () => {
      show(index);
    });
    switcher.append(button);
    return button;
  });

  function show(index: number): void {
    currentIndex = Math.max(0, Math.min(screens.length - 1, index));
    buttons.forEach((button, buttonIndex) => {
      button.setAttribute(
        "aria-pressed",
        buttonIndex === currentIndex ? "true" : "false",
      );
    });
    const screen = screens[currentIndex];
    if (screen !== undefined) {
      renderScreen(screenContainer, screen);
      buttons[currentIndex]?.focus();
    }
  }

  switcher.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      show(currentIndex - 1);
    } else if (event.key === "ArrowRight") {
      show(currentIndex + 1);
    }
  });

  show(0);
}

async function mountBrowserFlow(section: HTMLElement): Promise<void> {
  const [
    { mountFlow },
    { createBrowserFlowBridge },
    { createProjectFlow },
    { createBrowserHost },
  ] = await Promise.all([
    import("../flow/mount.ts"),
    import("../flow/bridge.ts"),
    import("../flow/session.ts"),
    import("../host.ts"),
  ]);
  mountFlow(section, createProjectFlow(createBrowserFlowBridge(createBrowserHost())));
}

function appendList(
  parent: HTMLElement,
  heading: string,
  entries: readonly string[],
): void {
  const label = document.createElement("h4");
  label.textContent = heading;
  const list = document.createElement("ul");
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry;
    list.append(item);
  }
  parent.append(label, list);
}

function renderScreen(container: HTMLElement, screen: StateScreenViewModel): void {
  container.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = `状态 ${screen.uxSpecRow}/12：${screen.label}（${screen.stateId}）`;
  const evidence = document.createElement("p");
  evidence.textContent = `强制性来源：${screen.evidenceSource}`;
  const cancelable = document.createElement("p");
  cancelable.textContent = screen.cancelable
    ? "本状态可取消（取消入口常驻）"
    : "本状态不可取消";
  container.append(heading, evidence, cancelable);

  appendList(container, "必须呈现（ux-spec §4，逐字）", screen.requiredItems);
  if (screen.forbiddenNotes.length > 0) {
    appendList(container, "不做（ux-spec 禁止语义，逐字）", screen.forbiddenNotes);
  }

  const a11yHeading = document.createElement("h4");
  a11yHeading.textContent = "无障碍（状态机层面成立，不推给 A-13）";
  const textEquivalent = document.createElement("p");
  textEquivalent.textContent = `文本等价：${screen.textEquivalent}`;
  const focusEntry = document.createElement("p");
  focusEntry.textContent = `焦点入口：${screen.focusEntry}；错误与进度不只依赖颜色`;
  container.append(a11yHeading, textEquivalent, focusEntry);

  if (screen.extensions.length > 0) {
    appendList(
      container,
      "领域扩展（契约扩展字段）",
      screen.extensions.map((entry) => `${entry.name}：${entry.value}`),
    );
  }

  if (screen.transitions.length > 0) {
    appendList(
      container,
      "允许的转移",
      screen.transitions.map((target) => `${target.label}（${target.id}）`),
    );
  }
}
