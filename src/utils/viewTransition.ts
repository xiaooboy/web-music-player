/**
 * 支持 ViewTransition 则包裹调用，否则直接调用 callback
 */
export function withViewTransition(callback: () => void) {
  const transitionDocument = document as Document & {
    startViewTransition?: (cb: () => void) => {
      finished: Promise<void>;
    };
  };

  if (supportsViewTransition()) {
    return {
      support: true,
      transition: transitionDocument.startViewTransition(callback),
    };
  }

  callback();
  return {
    support: false,
  };
}
export function supportsViewTransition() {
  return typeof document.startViewTransition === "function";
}
