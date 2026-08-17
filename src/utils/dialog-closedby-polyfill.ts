/* -------------------------------------------------------------------------- */
/* Public helper utilities                                                    */
/* -------------------------------------------------------------------------- */


/**
 * Detects native support for the `closedBy` property. If this function returns
 * `true`, **no** polyfill is needed because the user‑agent already exposes
 * the expected behavior.
 *
 * The check goes beyond a simple `"closedBy" in HTMLDialogElement.prototype`
 * test: Safari 26.2 exposes the property on the prototype but never completed
 * the implementation, so attribute reflection does not work. Creating a
 * detached `<dialog>`, setting `closedby="none"`, and reading back
 * `dialog.closedBy` verifies that the getter actually reflects the content
 * attribute – which is a prerequisite for the full feature to function.
 *
 * @see https://github.com/tak-dcxi/dialog-closedby-polyfill/issues/13
 */
export function isSupported(): boolean {
  if (
    typeof HTMLDialogElement === "undefined" ||
    typeof HTMLDialogElement.prototype !== "object" ||
    !("closedBy" in HTMLDialogElement.prototype)
  ) {
    return false;
  }

  // Ensure we are in a DOM environment with a usable `document` before
  // performing any behavioural checks. In some non‑Window runtimes,
  // `HTMLDialogElement` may exist even when `document` is unavailable.
  if (
    typeof document === "undefined" ||
    typeof (document as Document).createElement !== "function"
  ) {
    return false;
  }

  // Behavioral check: verify the getter actually reflects the content
  // attribute. Safari 26.2 exposes `closedBy` on the prototype but the
  // getter does not return the expected value.
  try {
    const testDialog = document.createElement("dialog");
    testDialog.setAttribute("closedby", "none");
    return (testDialog as HTMLDialogElement & { closedBy?: string }).closedBy === "none";
  } catch {
    // If anything goes wrong during the behavioural check, treat the
    // feature as unsupported rather than throwing at import time.
    return false;
  }
}
