import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/entry.css";
import { detectScrollbarWidth } from "./utils/scrollbar";

detectScrollbarWidth();
const app = createApp(App);
app.use(createPinia());
app.mount("#app");

registerSW({
  immediate: true,
});
