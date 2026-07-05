<script setup lang="ts">
import {
  ref,
  computed,
  nextTick,
  type Component,
  useTemplateRef,
  shallowRef,
} from "vue";

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  icon?: Component;
  children?: MenuItem[];
}
export interface Props {
  menu: MenuItem[];
  title?: string;
}
export interface EventPosition {
  clientX: number;
  clientY: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 子菜单项被选中时向上传播，触发逐级关闭 */
  select: [];
}>();

const menuRef = useTemplateRef("menuRef");
const menuStyle = ref<Record<string, string>>({});
const wasOpen = shallowRef(false);

/** 当前展开的子菜单索引（-1 表示无） */
const activeSub = ref(-1);
let closeSubmenuTimer: ReturnType<typeof setTimeout> | null = null;

/** 关闭过渡结束后待执行的下次行为 */
let pendingAction: (() => void) | null = null;

// ─── 子菜单 ref 管理 ──────────────────────────────────────────────────────────
interface ContextMenuHandle {
  open: (
    anchorOrEvent?: EventPosition | HTMLElement,
    before?: () => void,
  ) => void;
  close: () => void;
  getWasOpen: () => boolean;
}

const submenuRef = shallowRef<ContextMenuHandle | null>(null);

function setSubmenuRef(el: any) {
  submenuRef.value = el ? (el as ContextMenuHandle) : null;
}

/** 当前激活子菜单对应的 MenuItem */
const activeSubItem = computed(() =>
  activeSub.value >= 0 ? props.menu[activeSub.value] : undefined,
);

/** 菜单项中是否存在子菜单 */
const hasSubmenuItems = computed(() =>
  props.menu.some((item) => item.children),
);

// ─── Popover 生命周期 ─────────────────────────────────────────────────────────
function handleToggle(event: ToggleEvent) {
  wasOpen.value = event.newState === "open";
  if (event.newState !== "open") {
    activeSub.value = -1;
    submenuRef.value?.close();
  }
}

function onTransitionEnd(e: TransitionEvent) {
  if (e.target !== menuRef.value) return;
  if (wasOpen.value) return;
  if (!pendingAction) return;
  const action = pendingAction;
  pendingAction = null;
  requestAnimationFrame(() => action());
}

// ─── 打开 / 关闭 ──────────────────────────────────────────────────────────────
/**
 * 打开菜单
 * @param anchorOrEvent 鼠标位置 | 锚点元素（子菜单场景）
 * @param before showPopover 之前的回调
 */
function open(
  anchorOrEvent?: EventPosition | HTMLElement,
  before?: () => void,
) {
  const el = menuRef.value;
  if (!el) return;

  const doOpen = () => {
    before?.();
    nextTick(() => {
      el?.showPopover();
      requestAnimationFrame(() => {
        computePosition(anchorOrEvent);
      });
    });
  };

  if (getWasOpen()) {
    pendingAction = doOpen;
    el.hidePopover();
    return;
  }

  pendingAction = null;
  doOpen();
}

function computePosition(anchorOrEvent?: EventPosition | HTMLElement) {
  const el = menuRef.value;
  if (!el) return;
  if (!anchorOrEvent) {
    menuStyle.value = { left: "", top: "" };
    return;
  }

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const { clientWidth: menuWidth, clientHeight: menuHeight } = el;

  let left: number, top: number;

  if (anchorOrEvent instanceof HTMLElement) {
    // 锚点元素定位 — 子菜单场景
    const rect = anchorOrEvent.getBoundingClientRect();
    left = rect.right + 4;
    top = rect.top - 4;
    if (left + menuWidth > viewW) {
      left = rect.left - menuWidth - 4;
    }
  } else {
    // 鼠标位置定位 — 右键菜单场景
    left = anchorOrEvent.clientX + 4;
    top = anchorOrEvent.clientY - 4;
    if (left + menuWidth > viewW) {
      left = anchorOrEvent.clientX - menuWidth - 4;
    }
  }

  if (top + menuHeight > viewH) {
    top = viewH - menuHeight - 8;
  }
  if (top < 4) top = 4;

  menuStyle.value = { left: `${left}px`, top: `${top}px` };
}

function close() {
  submenuRef.value?.close();
  menuRef.value?.hidePopover();
  activeSub.value = -1;
}

// ─── 菜单项点击 ──────────────────────────────────────────────────────────────
function handleItemClick(item: MenuItem) {
  if (item.disabled) return;
  item.action?.();
  close();
  emit("select");
}

/** 子 ContextMenu 选中时逐级关闭 */
function handleChildSelect() {
  close();
  emit("select");
}

// ─── 子菜单悬停交互 ───────────────────────────────────────────────────────────
function handleSubmenuEnter(index: number, event: MouseEvent) {
  cancelCloseSubmenu();
  activeSub.value = index;
  const anchorEl = event.currentTarget as HTMLElement;
  // 等待 DOM 更新后再打开
  nextTick(() => submenuRef.value?.open(anchorEl));
}

function scheduleCloseSubmenu() {
  closeSubmenuTimer = setTimeout(() => {
    submenuRef.value?.close();
  }, 150);
}

function cancelCloseSubmenu() {
  if (closeSubmenuTimer) {
    clearTimeout(closeSubmenuTimer);
    closeSubmenuTimer = null;
  }
}

// ─── 暴露方法 ─────────────────────────────────────────────────────────────────
function getWasOpen() {
  return wasOpen.value;
}

defineExpose({ open, close, getWasOpen });
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
    <template v-for="(item, i) in menu" :key="i">
      <!-- 有子菜单的项 -->
      <div
        v-if="item.children?.length"
        class="context-menu-item has-submenu"
        @mouseenter="handleSubmenuEnter(i, $event)"
        @mouseleave="scheduleCloseSubmenu"
      >
        <component
          v-if="item.icon"
          :is="item.icon"
          :size="16"
          class="context-menu-icon"
        />
        {{ item.label }}
        <svg
          class="submenu-arrow"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>

      <!-- 无子菜单的普通项 -->
      <button
        v-else
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
    </template>

    <!-- 递归子菜单：只要菜单项中有 children 就渲染，避免 v-if 销毁导致关闭动画丢失 -->
    <ContextMenu
      v-if="hasSubmenuItems"
      :ref="setSubmenuRef"
      :menu="activeSubItem?.children ?? []"
      @select="handleChildSelect"
      @mouseenter="cancelCloseSubmenu"
      @mouseleave="scheduleCloseSubmenu"
    />
  </div>
</template>
