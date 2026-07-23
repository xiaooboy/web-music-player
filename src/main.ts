import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/entry.css";

/* 运行时检测滚动条实际占用宽度
   overlay scrollbar 不占布局空间时测量值为 0，经典滚动条为实际像素宽度。
   结果写入 --scrollbar-compensation，供 .scroll-borrow 工具类使用。
   必须在样式加载后、应用挂载前执行，以保证首次渲染即使用正确值。 */
{
  const el = document.createElement("div");
  el.style.cssText =
    "width:100px;height:100px;overflow:scroll;position:fixed;visibility:hidden;pointer-events:none";
  document.body.appendChild(el);
  const w = el.offsetWidth - el.clientWidth;
  el.remove();
  if (w !== 10) document.documentElement.style.setProperty("--scrollbar-compensation", `${w}px`);
}

const app = createApp(App);
app.use(createPinia());
app.mount("#app");

registerSW({
  immediate: true,
});
