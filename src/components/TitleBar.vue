<script setup lang="ts">
import { onMounted } from "vue";
import { Music3 } from "@lucide/vue";
import WindowControls from "./WindowControls.vue";

const isTauri = __IS_TAURI__;

function handleTitleBarDblClick(e: MouseEvent) {
  if (!isTauri) return;
  if ((e.target as HTMLElement).closest(".window-controls__btn")) return;
  const tauri = (window as any).__TAURI__;
  tauri?.window?.getCurrentWindow?.()?.toggleMaximize?.();
}

onMounted(() => {
  if (isTauri) {
    document.documentElement.style.setProperty("--window-safe-top", "32px");
  }
});
</script>

<template>
  <header
    v-if="isTauri"
    class="titlebar"
    data-tauri-drag-region
    @dblclick="handleTitleBarDblClick"
  >
    <!-- 左侧：应用图标与名称 -->
    <div class="titlebar__left" data-tauri-drag-region>
      <Music3
        :size="16"
        class="titlebar__logo"
        data-tauri-drag-region
      />
      <span class="titlebar__app-title" data-tauri-drag-region>Local Music</span>
    </div>

    <!-- 中间：空白拖拽区域 -->
    <div class="titlebar__center" data-tauri-drag-region />

    <!-- 右侧：复用窗口控制控件 -->
    <WindowControls v-if="isTauri" />
  </header>
</template>

<style scoped>
.titlebar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: var(--z-drag-region, 9999);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background-color: var(--color-background, #121212);
  border-bottom: 1px solid var(--gray-3, rgba(255, 255, 255, 0.06));
  color: var(--gray-11, #a1a1aa);
  user-select: none;
  -webkit-user-select: none;
}

/* 左侧 Logo 和标题 */
.titlebar__left {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding-left: 10px;
  flex-shrink: 0;
}

.titlebar__logo {
  color: var(--accent, #1ed760);
  font-weight: 700;
  flex-shrink: 0;
  pointer-events: none;
}

.titlebar__app-title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--gray-12, #f4f4f5);
}

/* 中间纯拖拽区域 */
.titlebar__center {
  flex: 1;
  height: 100%;
}
</style>
