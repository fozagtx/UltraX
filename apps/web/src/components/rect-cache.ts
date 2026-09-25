/**
 * Caches an element's bounding rect and refreshes it on resize/scroll,
 * so pointer handlers can read coordinates without forcing layout.
 */
export interface RectCache {
  readonly current: DOMRect;
  destroy: () => void;
}

export function createRectCache(el: Element): RectCache {
  let rect = el.getBoundingClientRect();
  const update = () => {
    rect = el.getBoundingClientRect();
  };
  const observer = new ResizeObserver(update);
  observer.observe(el);
  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, true);
  return {
    get current() {
      return rect;
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    },
  };
}
