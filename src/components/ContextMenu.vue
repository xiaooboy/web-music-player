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

function open(event?: EventPosition) {
  const el = menuRef.value;

  if (getOpenState()) {
    el.hidePopover();
    return;
  }
  nextTick(() => {
    // 先显示以获取实际尺寸
    el?.showPopover();
    requestAnimationFrame(() => {
      computePosition(event);
    });
  });
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
function getOpenState() {
  return menuRef.value?.matches(":popover-open");
}
function showPopover() {
  menuRef.value?.showPopover();
}
function hidePopover() {
  menuRef.value?.hidePopover();
}
function togglePopover() {
  if (getOpenState()) {
    hidePopover();
  } else {
    showPopover();
  }
}
defineExpose({
  open,
  close,
  getOpenState,
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
