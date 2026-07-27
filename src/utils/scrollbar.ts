/**
 * 运行时检测滚动条实际占用宽度
 *
 * overlay scrollbar 不占布局空间时测量值为 0，经典滚动条为实际像素宽度。
 * 结果写入以下 CSS 自定义属性到 `<html>`：
 * - `--scrollbar-size`           滚动条实际宽度 (px)
 * - `--scrollbar-compensation-i` 内嵌补偿值 (px)，即 `16 - scrollbarWidth`
 * - `--scrollbar-compensation-o` 覆盖补偿值 (px)，固定为 16
 *
 * 供 `.scroll-borrow` 等工具类使用。
 * 必须在样式加载后、应用挂载前执行，以保证首次渲染即使用正确值。
 */
export function detectScrollbarWidth(): void {
  const el = document.createElement("div");
  el.style.cssText =
    "width:100px;height:100px;overflow:scroll;position:fixed;visibility:hidden;pointer-events:none";
  document.body.appendChild(el);

  const w = el.offsetWidth - el.clientWidth;
  el.remove();

  const i = 16 - w;
  const o = 16;

  const html = document.documentElement;
  html.style.setProperty("--scrollbar-size", `${w}px`);
  html.style.setProperty("--scrollbar-compensation-i", `${i}px`);
  html.style.setProperty("--scrollbar-compensation-o", `${o}px`);
}
