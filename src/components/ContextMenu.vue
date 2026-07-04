<script setup lang="ts">
import { ref, nextTick, type Component, useTemplateRef, shallowRef } from "vue";

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  icon?: Component;
}
export interface OpenOptions {
  menu: MenuItem[];
  title?: string;
  skipPosition?: boolean;
}
export interface Props {
  menu: MenuItem[];
  title?: string;
  skipPosition?: boolean;
}
export interface EventPosition {
  clientX: number;
  clientY: number;
}
const props = defineProps<Props>();
const menuRef = useTemplateRef("menuRef");
const menuStyle = ref<Record<string, string>>({});
const wasOpen = shallowRef(false);

/** 关闭过渡结束后待执行的下次行为 */
let pendingAction: (() => void) | null = null;

function handleToggle(event: ToggleEvent) {
  wasOpen.value = event.newState === "open";
}

/** 监听关闭方向 transitionend，完成后执行 pendingAction */
function onTransitionEnd(e: TransitionEvent) {
  if (e.target !== menuRef.value) return;
  // 只在关闭方向的过渡上触发：关闭时 opacity 从 1→0
  if (wasOpen.value) return;
  if (!pendingAction) return;
  const action = pendingAction;
  pendingAction = null;
  // 等一帧确保浏览器已将元素置为 display:none，
  // 这样 @starting-style 才能正确触发
  requestAnimationFrame(() => {
    action();
  });
}
/**
 * 打开菜单，已打开时会关闭再打开
 * @param event 位置参数
 * @param before showPopover 之前的回调
 */
function open(event?: EventPosition, before?: () => void) {
  const el = menuRef.value;
  if (!el) return;

  const doOpen = () => {
    before?.();
    nextTick(() => {
      el?.showPopover();
      requestAnimationFrame(() => {
        computePosition(event);
      });
    });
  };
  console.log(getWasOpen());
  if (getWasOpen()) {
    // 菜单已打开 → 记录下次行为，先关闭
    pendingAction = doOpen;
    el.hidePopover();
    return;
  }

  // 菜单已关闭 → 清除残留的 pendingAction，直接打开
  pendingAction = null;
  doOpen();
}

function computePosition(event?: EventPosition) {
  const el = menuRef.value;
  if (!el) return;
  if (!event) {
    menuStyle.value = {
      left: "",
      top: "",
    };
    return;
  }
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const { clientWidth: menuWidth, clientHeight: menuHeight } = el;

  let left = event.clientX + 4;
  let top = event.clientY - 4;

  if (left + menuWidth > viewW) {
    left = event.clientX - menuWidth - 4;
  }
  if (top + menuHeight > viewH) {
    top = viewH - menuHeight - 8;
  }
  if (top < 4) top = 4;

  menuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  };
}

function close() {
  menuRef.value?.hidePopover();
}

function handleItemClick(item: MenuItem) {
  if (item.disabled) return;
  item.action();
  close();
}
function getWasOpen() {
  return wasOpen.value;
}
function showPopover() {
  menuRef.value?.showPopover();
}
function hidePopover() {
  menuRef.value?.hidePopover();
}
function togglePopover() {
  if (getWasOpen()) {
    hidePopover();
  } else {
    showPopover();
  }
}
defineExpose({
  open,
  close,
  getWasOpen,
  showPopover,
  hidePopover,
  togglePopover,
});
</script>

<template>
  <div
    ref="menuRef"
    class="context-menu"
    popover="auto"
    :style="menuStyle"
    @click.stop
    @toggle="handleToggle"
    @transitionend="onTransitionEnd"
  >
    <div v-if="title" class="context-menu-header">
      {{ title }}
    </div>
    <button
      v-for="(item, i) in menu"
      :key="i"
      class="context-menu-item"
      :class="{ 'is-disabled': item.disabled }"
      type="button"
      @click="handleItemClick(item)"
    >
      <component
        v-if="item.icon"
        :is="item.icon"
        :size="16"
        class="context-menu-icon"
      />
      {{ item.label }}
    </button>
  </div>
</template>
