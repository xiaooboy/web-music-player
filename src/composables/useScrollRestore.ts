import { onBeforeUnmount, watch, type Ref } from "vue";

/**
 * 视图切换会卸载整棵视图组件，滚动容器随 DOM 一起销毁，scrollTop 归零。
 * 这里把滚动位置按 key 记在内存（刷新页面即清空），重新挂载时还原。
 */
const scrollOffsets = new Map<string, number>();

/** 供虚拟滚动器设置 initialOffset，让首帧就渲染在目标位置 */
export function readScrollOffset(key: string): number {
  return scrollOffsets.get(key) ?? 0;
}

type ScrollTarget = Ref<HTMLElement | null | undefined>;

/**
 * 记住并还原滚动容器的位置。
 *
 * - key 在 setup 时求值一次，保证卸载时写入的仍是挂载时对应的位置
 * - 滚动过程中持续记录，元素先被移出 DOM（如 v-if 收起）也不至于读到 0
 * - 监听容器出现而非 onMounted，兼容音乐源等异步加载后才渲染的列表
 */
export function useScrollRestore(
  key: string | (() => string),
  target: ScrollTarget,
) {
  const resolvedKey = typeof key === "function" ? key() : key;

  function save() {
    const el = target.value;
    if (el) scrollOffsets.set(resolvedKey, el.scrollTop);
  }

  function restore() {
    const offset = scrollOffsets.get(resolvedKey) ?? 0;
    const el = target.value;
    if (!el || !offset) return;
    el.scrollTop = offset;
  }

  // flush: post —— 等容器渲染完成、内联高度生效后再写入，否则会被浏览器钳位
  watch(
    target,
    (el, prevEl) => {
      prevEl?.removeEventListener("scroll", save);
      if (!el) return;
      el.addEventListener("scroll", save, { passive: true });
      restore();
    },
    { flush: "post" },
  );

  onBeforeUnmount(() => {
    save();
    target.value?.removeEventListener("scroll", save);
  });

  return { save, restore };
}
