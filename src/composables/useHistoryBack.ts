import { onMounted, onBeforeUnmount } from "vue";

/**
 * 拦截浏览器/安卓返回手势。
 * onMounted 时 push 一条 history 条目并监听 popstate，
 * 当用户按下返回时触发 callback 而非离开页面。
 * onBeforeUnmount 时移除监听，不清理 history（避免异步 popstate 干扰新页面）。
 */
export function useHistoryBack(callback: () => void) {
  function onPopState() {
    callback();
  }

  onMounted(() => {
    history.pushState(null, "");
    window.addEventListener("popstate", onPopState);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("popstate", onPopState);
  });
}
