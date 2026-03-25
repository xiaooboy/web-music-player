import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import "./styles.css";

createApp(App).mount("#app");

registerSW({
  immediate: true,
});
