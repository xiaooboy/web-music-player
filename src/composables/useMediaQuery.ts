import { ref, onMounted, onBeforeUnmount } from "vue";

/**
 * 响应式媒体查询 composable
 * @param query CSS 媒体查询字符串，如 "(max-width: 640px)"
 */
export function useMediaQuery(query: string) {
  const matches = ref(false);
  let mql: MediaQueryList | null = null;

  function handleChange(e: MediaQueryListEvent) {
    matches.value = e.matches;
  }

  onMounted(() => {
    mql = window.matchMedia(query);
    matches.value = mql.matches;
    mql.addEventListener("change", handleChange);
  });

  onBeforeUnmount(() => {
    mql?.removeEventListener("change", handleChange);
  });

  return matches;
}
