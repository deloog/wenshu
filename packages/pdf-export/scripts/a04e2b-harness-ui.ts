/**
 * A-04E-2b 工装（决策 #25 D1，非产品）：工装页驱动薄封装——所有页面状态
 * 变更经 BrowserSession.evaluate 注入，本类只做表达式拼装与值返回，不做
 * 任何判定。页面侧 API 契约见 a04e2b-harness-page.ts 模块头。
 */
import type { BrowserSession } from "@wenshu/report-render";

export interface CancelFlag {
  readonly requested: boolean;
  readonly at: number | null;
}

export class HarnessUi {
  private readonly session: BrowserSession;

  public constructor(session: BrowserSession) {
    this.session = session;
  }

  public evaluate<T>(expression: string): Promise<T> {
    return this.session.evaluate<T>(expression);
  }

  public initSlots(
    pageCount: number,
    headerText: string,
    initialUrl: string,
  ): Promise<unknown> {
    return this.evaluate(
      `window.__initSlots(${pageCount}, ${JSON.stringify(headerText)}, ${JSON.stringify(initialUrl)})`,
    );
  }

  public setStatus(text: string): Promise<unknown> {
    return this.evaluate(`window.__setStatus(${JSON.stringify(text)})`);
  }

  public setSlotPdf(page: number, url: string): Promise<unknown> {
    return this.evaluate(`window.__setSlotPdf(${page}, ${JSON.stringify(url)})`);
  }

  public setStale(page: number, stale: boolean): Promise<unknown> {
    return this.evaluate(`window.__setStale(${page}, ${stale})`);
  }

  /** 每轮测量前复位：探针缓冲 + 取消标志。 */
  public resetForRun(): Promise<unknown> {
    return this.evaluate(
      `window.__cancelRequested = false; window.__cancelRequestedAt = null; window.__resetProbe();`,
    );
  }

  /** 对真实按钮元素 dispatch .click()——走页面真实 DOM 事件 handler。 */
  public clickProbeButton(): Promise<unknown> {
    return this.evaluate(`document.getElementById("probe-btn").click()`);
  }

  /** 点击工装页真实「取消后台任务」按钮（页面 handler 置 __cancelRequested）。 */
  public clickCancelButton(): Promise<unknown> {
    return this.evaluate(`document.getElementById("cancel-btn").click()`);
  }

  public readCancelFlag(): Promise<CancelFlag> {
    return this.evaluate<CancelFlag>(
      `({ requested: window.__cancelRequested, at: window.__cancelRequestedAt })`,
    );
  }

  public maxGapMs(): Promise<number> {
    return this.evaluate<number>(`window.__probe.maxGapMs`);
  }

  public probeSnapshot(): Promise<unknown> {
    return this.evaluate(`window.__probe`);
  }

  /** 页槽替换事件计数（「后台期间旧槽位未替换」的事实依据）。 */
  public slotPdfEventCount(): Promise<number> {
    return this.evaluate<number>(
      `window.__probe.events.filter((e) => e.label.startsWith("slot-pdf:")).length`,
    );
  }
}
