<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount } from "vue";

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

const visible = ref(false);
const items = ref<MenuItem[]>([]);
const menuRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const menuKey = ref(0);
const isAnimating = ref(false);

function open(event: MouseEvent, menuItems: MenuItem[]) {
  // 如果正在动画中，忽略
  if (isAnimating.value) return;

  const wasOpen = visible.value;

  if (wasOpen) {
    // 标记正在动画
    isAnimating.value = true;
    visible.value = false;
    menuKey.value += 1;
  }

  items.value = menuItems;

  if (wasOpen) {
    // 等待离场动画完成后再显示
    nextTick(() => {
      setTimeout(() => {
        computePosition(event);
        isAnimating.value = false;
        visible.value = true;
      }, 150); // 稍微大于 transition 时间 120ms
    });
  } else {
    nextTick(() => {
      computePosition(event);
      visible.value = true;
    });
  }
}

function computePosition(event: MouseEvent) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const menuWidth = 160;
  const menuHeight = Math.max(36, (items.value.length || 1) * 36 + 12);

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
  visible.value = false;
}

function handleItemClick(item: MenuItem) {
  if (item.disabled) return;
  item.action();
  close();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && visible.value) {
    close();
  }
}

function handleDocClick(e: MouseEvent) {
  if (!visible.value) return;
  if (menuRef.value?.contains(e.target as Node)) return;
  close();
}

document.addEventListener("keydown", handleKeydown, true);
document.addEventListener("click", handleDocClick, true);
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown, true);
  document.removeEventListener("click", handleDocClick, true);
});

defineExpose({ open, close });
</script>

<template>
  <Teleport to="body">
    <div
      :key="menuKey"
      ref="menuRef"
      class="context-menu"
      :class="{ 'is-open': visible }"
      :style="menuStyle"
      @click.stop
    >
      <button
        v-for="(item, i) in items"
        :key="i"
        class="context-menu-item"
        :class="{ 'is-disabled': item.disabled }"
        type="button"
        @click="handleItemClick(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>
