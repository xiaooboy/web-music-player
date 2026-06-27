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
