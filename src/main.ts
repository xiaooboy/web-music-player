import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/entry.css";
import { detectScrollbarWidth } from "./utils/scrollbar";
import "./utils/polyfill";

// Tauri 窗口没有系统标题栏，顶部安全区固定预留 30px（拖拽区 + 视觉留白）。
if (__IS_TAURI__) {
  document.documentElement.classList.add("is-tauri");
  document.documentElement.style.setProperty("--window-safe-top", "32px");
}

detectScrollbarWidth();
const app = createApp(App);
app.use(createPinia());
app.mount("#app");
console.log(__IS_TAURI__,typeof __IS_TAURI__);

if (!__IS_TAURI__) {
    registerSW({
      immediate: true,
    });
}
