<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Minus, Square, Copy, X } from "@lucide/vue";

interface TauriWindow {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  listen?: (event: string, handler: (event: any) => void) => Promise<() => void>;
}

const isMaximized = ref(false);
let unlistenResize: (() => void) | null = null;

// 使用构建期注入的 __IS_TAURI__ 常量
const isTauri = __IS_TAURI__;

function getAppWindow(): TauriWindow | null {
  if (typeof window === "undefined" || !isTauri) return null;
  const tauri = (window as any).__TAURI__;
  if (tauri?.window?.getCurrentWindow) {
    return tauri.window.getCurrentWindow();
  }
  return null;
}

async function checkMaximized() {
  const win = getAppWindow();
  if (win) {
    try {
      isMaximized.value = await win.isMaximized();
    } catch {
      // 降级处理
    }
  }
}

async function handleMinimize() {
  const win = getAppWindow();
  await win?.minimize();
}

async function handleToggleMaximize() {
  const win = getAppWindow();
  if (win) {
    await win.toggleMaximize();
    await checkMaximized();
  }
}

async function handleClose() {
  const win = getAppWindow();
  await win?.close();
}

onMounted(async () => {
  if (isTauri) {
    await checkMaximized();

    const win = getAppWindow();
    if (win?.listen) {
      try {
        unlistenResize = await win.listen("tauri://resize", () => {
          checkMaximized();
        });
      } catch {
        // ignore
      }
    }

    window.addEventListener("resize", checkMaximized);
  }
});

onUnmounted(() => {
  if (unlistenResize) {
    unlistenResize();
    unlistenResize = null;
  }
  window.removeEventListener("resize", checkMaximized);
});

defineExpose({
  handleMinimize,
  handleToggleMaximize,
  handleClose,
  isMaximized,
});
</script>

<template>
  <div v-if="isTauri" class="window-controls">
    <!-- 最小化 -->
    <button
      type="button"
      class="window-controls__btn"
      title="最小化"
      aria-label="最小化"
      @click="handleMinimize"
    >
      <Minus :size="18" />
    </button>

    <!-- 最大化 / 还原 -->
    <button
      type="button"
      class="window-controls__btn"
      :title="isMaximized ? '向下还原' : '最大化'"
      :aria-label="isMaximized ? '向下还原' : '最大化'"
      @click="handleToggleMaximize"
    >
      <Copy v-if="isMaximized" :size="18" />
      <Square v-else :size="18" />
    </button>

    <!-- 关闭 -->
    <button
      type="button"
      class="window-controls__btn window-controls__btn--close"
      title="关闭"
      aria-label="关闭"
      @click="handleClose"
    >
      <X :size="18" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
  app-region: no-drag;
}

.window-controls__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  color: var(--color-text);
  font-weight: 700;
  cursor: default;
  outline: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.window-controls__btn:hover {
  background-color: var(--gray-3, rgba(255, 255, 255, 0.08));
}

.window-controls__btn:active {
  background-color: var(--gray-4, rgba(255, 255, 255, 0.14));
}

/* 关闭按钮定制悬浮红色 */
.window-controls__btn--close:hover {
  background-color: #e81123 !important;
  color: #ffffff !important;
}

.window-controls__btn--close:active {
  background-color: #c42b1c !important;
  color: #ffffff !important;
}
</style>
