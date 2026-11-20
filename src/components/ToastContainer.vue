<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";
import { toasts } from "../composables/useToast";
import { useUIStore } from "../stores";

const toastList = toasts;
const uiStore = useUIStore();
const containerRef = useTemplateRef<HTMLDivElement>("containerRef");

function bringToFront() {
  const el = containerRef.value;
  if (!el || toastList.value.length === 0) return;
  if (typeof el.showPopover !== "function") return;

  try {
    // 重新进入 Top Layer 栈顶，确保不被后续打开的 <dialog> 模态层（如播放详情页）覆盖
    el.hidePopover();
  } catch {
    // 忽略未处于 open 态时的关闭报错
  }
  try {
    el.showPopover();
  } catch {
    // 忽略异常
  }
}

function handleAfterLeave() {
  if (toastList.value.length === 0) {
    try {
      containerRef.value?.hidePopover();
    } catch {
      // 忽略异常
    }
  }
}

// 监听 Toast 数量变化：当有新增 Toast 时置顶展示
watch(
  () => toastList.value.length,
  (newLen) => {
    if (newLen > 0) {
      nextTick(bringToFront);
    }
  },
  { immediate: true },
);

// 监听播放页打开状态：播放页打开时将其再次置于 Top Layer 顶层
watch(
  () => uiStore.nowPlayingOpen,
  () => {
    if (toastList.value.length > 0) {
      nextTick(bringToFront);
    }
  },
);

function handleGlobalToggle(event: Event) {
  const target = event.target as HTMLElement | null;
  if (target !== containerRef.value && (event as ToggleEvent).newState === "open") {
    if (toastList.value.length > 0) {
      nextTick(bringToFront);
    }
  }
}

onMounted(() => {
  if (toastList.value.length > 0) {
    bringToFront();
  }
  document.addEventListener("toggle", handleGlobalToggle, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("toggle", handleGlobalToggle, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="containerRef"
      class="toast-container"
      popover="manual"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup name="toast" @after-leave="handleAfterLeave">
        <div v-for="item in toastList" :key="item.id" class="toast-container__item">
          {{ item.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  inset: auto auto 80px 50%;
  z-index: var(--z-toast);
  display: none;
  flex-direction: column-reverse;
  gap: 8px;
  width: max-content;
  max-width: calc(100vw - 32px);
  margin: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
  transform: translateX(-50%);
  transition: none;
  pointer-events: none;
  opacity: 1;
}

.toast-container:popover-open {
  display: flex;
}

/* 不支持 Popover API 时的降级 */
.toast-container:not([popover]) {
  display: flex;
}

.toast-container::backdrop {
  background: transparent;
  pointer-events: none;
}

.toast-container__item {
  padding: 10px 20px;
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: nowrap;
  background: var(--gray-a10);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(12px);
}

.toast-enter-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.toast-enter-from {
  transform: translateY(12px);
  opacity: 0;
}

.toast-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}
</style>
