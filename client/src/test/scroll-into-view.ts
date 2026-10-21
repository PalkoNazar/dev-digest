/* Test helper: jsdom has no `Element.prototype.scrollIntoView` — record every call
   (the element it was called on + its options) and run requestAnimationFrame
   callbacks synchronously so "scroll after the open body rendered" is observable. */
import { vi } from "vitest";

export interface ScrollCall {
  el: Element;
  opts: ScrollIntoViewOptions | boolean | undefined;
}

export function stubScrollIntoView() {
  const calls: ScrollCall[] = [];
  const proto = Element.prototype as unknown as { scrollIntoView?: unknown };
  const original = proto.scrollIntoView;
  proto.scrollIntoView = function (this: Element, opts?: ScrollIntoViewOptions | boolean) {
    calls.push({ el: this, opts });
  };
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  return {
    calls,
    restore() {
      if (original === undefined) delete proto.scrollIntoView;
      else proto.scrollIntoView = original;
      vi.unstubAllGlobals();
    },
  };
}

/** A big added-only patch: `count` lines `line 1` … `line <count>` on the new side. */
export function bigPatch(count: number): string {
  const body = Array.from({ length: count }, (_, i) => `+line ${i + 1}`).join("\n");
  return `@@ -0,0 +1,${count} @@\n${body}`;
}
