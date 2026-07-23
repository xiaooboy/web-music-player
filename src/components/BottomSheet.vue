<script setup lang="ts">
import { useTemplateRef, onMounted, onBeforeUnmount } from "vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    /**
     * 锚点比例数组（基于视口高度），如 [0.5, 1] 表示半屏和全屏
     * - 多个锚点：可上拉切换到更大锚点，下拉关闭
     * - 单个锚点：高度适应内容，不可上拉扩展，只可下拉关闭
     * - 空数组或不传：高度适应内容，不可拖拽调整
     * 默认 [0.5, 1]
     */
    snapPoints?: number[];
    /** 是否隐藏顶部拖拽把手 */
    hideHandle?: boolean;
    /** body 容器的额外 class */
    bodyClass?: string;
    /** 内容区域的额外 class */
    contentClass?: string;
    /** 拖拽把手的额外 class */
    handleClass?: string;
    /** 标题的额外 class */
    titleClass?: string;
  }>(),
  { snapPoints: () => [0.5, 1], hideHandle: false },
);

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = useTemplateRef("dialogRef");
const bodyRef = useTemplateRef("bodyRef");

// ─── 模式判定 ──────────────────────────────────────────────────────────────
/** 是否有可切换的锚点（≥2 个才允许拖拽调整高度） */
const hasResizableSnaps = () => props.snapPoints.length >= 2;

// ─── Snap points ─────────────────────────────────────────────────────────
let currentSnapIndex = 0;
let dragStartTranslateY = 0;
let dragStartY = 0;
let dragStartX = 0;
let isDragging = false;

// ─── 方向锁定（与原生 BottomSheet 对齐） ─────────────────────────────────
/** 手势方向锁定状态：pending = 尚未判定，vertical = 垂直拖拽，horizontal = 横向放行 */
let dragOrientation: "pending" | "vertical" | "horizontal" = "pending";
/** 方向判定的最小位移阈值（px），近似 Android touchSlop */
const TOUCH_SLOP = 8;

const sortedSnaps = () => [...props.snapPoints].sort((a, b) => a - b);
function snapToHeight(ratio: number) {
  return Math.round(ratio * window.innerHeight);
}

/** 最大锚点对应的高度（即 Sheet 的固定总高度） */
function maxSnapHeight() {
  return snapToHeight(sortedSnaps()[sortedSnaps().length - 1]);
}

/** 给定锚点比例，计算对应的 translateY（向下偏移 = 隐藏底部内容） */
function snapToTranslateY(ratio: number) {
  return maxSnapHeight() - snapToHeight(ratio);
}

/** 从 body 的 style 中读取当前 translateY 值 */
function getCurrentTranslateY(): number {
  if (!bodyRef.value) return 0;
  const match = bodyRef.value.style.transform.match(/translateY\((.+)px\)/);
  return match ? parseFloat(match[1]) : 0;
}

/** 根据 translateY 值找到最近的锚点索引 */
function nearestSnapIndex(translateY: number) {
  const snaps = sortedSnaps();
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < snaps.length; i++) {
    const dist = Math.abs(translateY - snapToTranslateY(snaps[i]));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function snapTo(index: number, animate = true) {
  const body = bodyRef.value;
  if (!body) return;
  currentSnapIndex = index;
  const ty = snapToTranslateY(sortedSnaps()[index]);
  if (animate) {
    body.style.transition = "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)";
    body.addEventListener(
      "transitionend",
      () => {
        if (bodyRef.value) bodyRef.value.style.transition = "";
      },
      { once: true },
    );
  }
  body.style.transform = `translateY(${ty}px)`;
}

// ─── 拖拽（触摸 + 鼠标） ────────────────────────────────────────────────────
type DragMode = "drag" | "observe" | "ignore";

/**
 * 判断手势起始时的交互模式：
 * - drag：直接接管拖拽（handle、非滚动区等）
 * - observe：先放行内容滚动，到顶后下滑时再接管（可滚动内容区）
 * - ignore：完全忽略（交互元素）
 */
function getDragMode(target: EventTarget | null): DragMode {
  // 交互元素（滑块、按钮等）完全忽略
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (
      tag === "INPUT" ||
      tag === "BUTTON" ||
      tag === "SELECT" ||
      tag === "TEXTAREA" ||
      tag === "A" ||
      target.closest('input, button, select, textarea, a, [role="slider"]')
    )
      return "ignore";
  }
  // 从 target 向上查找可滚动祖先
  if (target instanceof HTMLElement) {
    let el: HTMLElement | null = target;
    const boundary = bodyRef.value;
    while (el && el !== boundary) {
      if (el.scrollHeight > el.clientHeight) return "observe";
      el = el.parentElement;
    }
  }
  return "drag";
}

/** 观察模式下追踪的可滚动元素 */
let observingScrollEl: HTMLElement | null = null;
let isObserving = false;

function handleDragStart(clientX: number, clientY: number) {
  dragStartX = clientX;
  dragStartY = clientY;
  dragStartTranslateY = getCurrentTranslateY();
  isDragging = true;
  isObserving = false;
  observingScrollEl = null;
  dragOrientation = "pending";
}

function handleObserveStart(clientX: number, clientY: number, scrollEl: HTMLElement) {
  dragStartX = clientX;
  dragStartY = clientY;
  isObserving = true;
  observingScrollEl = scrollEl;
  dragOrientation = "pending";
}

/** @returns 是否实际处理了拖拽 */
function handleDragMove(clientX: number, clientY: number): boolean {
  if (!isDragging || !bodyRef.value || !dialogRef.value) return false;

  // ─── 方向锁定：未判定时根据主方向决定是否接管 ──────
  if (dragOrientation === "pending") {
    const dx = Math.abs(clientX - dragStartX);
    const dy = Math.abs(clientY - dragStartY);
    if (dx < TOUCH_SLOP && dy < TOUCH_SLOP) return false; // 位移不足，继续等待
    dragOrientation = dx > dy ? "horizontal" : "vertical";
    if (dragOrientation === "horizontal") {
      // 横向手势 → 放弃拖拽，让子元素自行处理
      isDragging = false;
      return false;
    }
  } else if (dragOrientation === "horizontal") {
    return false;
  }

  const deltaY = clientY - dragStartY;

  // ─── 适应内容模式（单锚点或无锚点）：只允许下拉关闭 ────
  if (!hasResizableSnaps()) {
    if (deltaY <= 0) return false;
    const damped = deltaY * 0.6;
    bodyRef.value.style.transition = "none";
    bodyRef.value.style.transform = `translateY(${damped}px)`;
    return true;
  }

  // ─── 锚点模式：translateY 拖拽（原生风格） ──────────────
  const currentSnapTranslateY = snapToTranslateY(sortedSnaps()[currentSnapIndex]);

  if (deltaY > 0) {
    // 下拉 → 关闭方向，阻尼
    const overflow = deltaY * 0.6;
    bodyRef.value.style.transition = "none";
    bodyRef.value.style.transform = `translateY(${currentSnapTranslateY + overflow}px)`;
    return true;
  }

  // 上拉 → 自由移动到更大锚点
  let newTranslateY = dragStartTranslateY + deltaY;

  if (newTranslateY < 0) {
    // 超过最大锚点 → 阻尼回弹
    const overscroll = -newTranslateY;
    const damped = -overscroll * 0.4;
    bodyRef.value.style.transition = "none";
    bodyRef.value.style.transform = `translateY(${damped}px)`;
    return true;
  }

  bodyRef.value.style.transition = "none";
  bodyRef.value.style.transform = `translateY(${newTranslateY}px)`;
  return true;
}

/**
 * 观察模式：不拦截默认滚动，监测可滚动元素是否到顶且用户在下滑，
 * 满足条件时切换为拖拽模式。
 * @returns 是否切换到了拖拽模式
 */
function handleObserveMove(clientX: number, clientY: number): boolean {
  if (!isObserving || !observingScrollEl || !bodyRef.value) return false;

  // 方向锁定：横向滑动不触发 observe → drag 切换
  if (dragOrientation === "pending") {
    const dx = Math.abs(clientX - dragStartX);
    const dy = Math.abs(clientY - dragStartY);
    if (dx >= TOUCH_SLOP || dy >= TOUCH_SLOP) {
      dragOrientation = dx > dy ? "horizontal" : "vertical";
    }
  }
  if (dragOrientation === "horizontal") return false;

  const deltaY = clientY - dragStartY;
  // 可滚动元素已到顶且用户下滑 → 切换为拖拽
  if (observingScrollEl.scrollTop <= 0 && deltaY > 0) {
    isObserving = false;
    observingScrollEl = null;
    // 以当前位置为起点启动拖拽
    handleDragStart(clientX, clientY);
    return true;
  }
  return false;
}

function handleDragEnd() {
  // 观察模式：直接重置
  if (isObserving) {
    isObserving = false;
    observingScrollEl = null;
    return;
  }
  if (!isDragging || !bodyRef.value || !dialogRef.value) return;
  isDragging = false;

  // ─── 适应内容模式：translateY 拖拽 ───────────────────────
  if (!hasResizableSnaps()) {
    const currentY = getCurrentTranslateY();
    if (currentY > 48) {
      close();
      return;
    }
    // 弹回
    bodyRef.value.style.transition = "transform 250ms cubic-bezier(0.32, 0.72, 0, 1)";
    bodyRef.value.style.transform = "";
    bodyRef.value.addEventListener(
      "transitionend",
      () => {
        if (bodyRef.value) bodyRef.value.style.transition = "";
      },
      { once: true },
    );
    return;
  }

  // ─── 锚点模式：translateY 拖拽 ───────────────────────────
  const currentTranslateY = getCurrentTranslateY();
  const currentSnapTranslateY = snapToTranslateY(sortedSnaps()[currentSnapIndex]);

  if (currentTranslateY > currentSnapTranslateY) {
    // 被下拉 → 检查是否关闭
    const overflow = currentTranslateY - currentSnapTranslateY;
    if (overflow > 60) {
      close();
      return;
    }
    snapTo(currentSnapIndex);
    return;
  }

  // 被上拉 → 吸附到最近锚点
  const idx = nearestSnapIndex(currentTranslateY);
  snapTo(idx);
}

// ─── 触摸事件适配 ──────────────────────────────────────────────────────────
function handleTouchStart(e: TouchEvent) {
  const mode = getDragMode(e.target);
  if (mode === "ignore") return;
  const clientX = e.touches[0].clientX;
  const clientY = e.touches[0].clientY;
  if (mode === "observe") {
    // 找到最近的可滚动祖先作为观察目标
    let el = e.target instanceof HTMLElement ? e.target : null;
    const boundary = bodyRef.value;
    while (el && el !== boundary) {
      if (el.scrollHeight > el.clientHeight) {
        handleObserveStart(clientX, clientY, el);
        return;
      }
      el = el.parentElement;
    }
    return;
  }
  handleDragStart(clientX, clientY);
}

function handleTouchMove(e: TouchEvent) {
  // 观察模式：监测是否应切换为拖拽
  if (isObserving) {
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    if (handleObserveMove(clientX, clientY)) {
      // 已切换为拖拽，处理当前帧
      if (handleDragMove(clientX, clientY)) {
        e.preventDefault();
      }
    }
    return;
  }
  if (!isDragging) return;
  if (handleDragMove(e.touches[0].clientX, e.touches[0].clientY)) {
    e.preventDefault();
  }
}

function handleTouchEnd() {
  handleDragEnd();
}

// ─── 鼠标事件适配 ──────────────────────────────────────────────────────────
function handleMouseDown(e: MouseEvent) {
  const mode = getDragMode(e.target);
  if (mode === "ignore") return;
  // 只响应左键
  if (e.button !== 0) return;
  e.preventDefault(); // 防止拖拽时选中文字
  handleDragStart(e.clientX, e.clientY);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

function handleMouseMove(e: MouseEvent) {
  handleDragMove(e.clientX, e.clientY);
}

function handleMouseUp() {
  handleDragEnd();
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
}

// ─── 非被动触摸事件（阻止默认滚动） ──────────────────────────────────────
onMounted(() => {
  bodyRef.value?.addEventListener("touchmove", handleTouchMove, { passive: false });
});
onBeforeUnmount(() => {
  bodyRef.value?.removeEventListener("touchmove", handleTouchMove);
});

function open() {
  if (bodyRef.value) {
    bodyRef.value.style.transition = "";
    bodyRef.value.style.height = "";
    bodyRef.value.style.transform = "";
  }
  dialogRef.value?.style.removeProperty("--backdrop-alpha");
  currentSnapIndex = 0;
  dialogRef.value?.showModal();

  if (hasResizableSnaps()) {
    // 锚点模式：设置固定总高度，再通过 translateY 显示初始锚点
    requestAnimationFrame(() => {
      if (bodyRef.value) {
        bodyRef.value.style.height = `${maxSnapHeight()}px`;
      }
      snapTo(0, false);
    });
  }
  // 适应内容模式：不设 height，内容自适应
}

function close() {
  dialogRef.value?.close();
}

/**
 * <dialog> 原生 close 事件，覆盖所有关闭路径：
 * - 程序调用 close()
 * - Android 返回手势 / ESC 键触发 cancel 后浏览器自动关闭
 * - 点击 backdrop 关闭
 * 统一在此 emit，避免重复触发
 */
function handleDialogClose() {
  emit('close');
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === dialogRef.value) close();
}

defineExpose({ open, close });
</script>

<template>
  <dialog ref="dialogRef" class="bottom-sheet" @click="handleBackdropClick" @close="handleDialogClose">
    <div
      ref="bodyRef"
      class="bottom-sheet__body"
      :class="bodyClass"
      @click.stop
      @touchstart.stop="handleTouchStart"
      @touchend.stop="handleTouchEnd"
      @mousedown.stop="handleMouseDown"
    >
      <div v-if="!hideHandle" class="bottom-sheet__handle" :class="handleClass" aria-hidden="true" />
      <div v-if="title" class="bottom-sheet__title" :class="titleClass">{{ title }}</div>
      <div class="bottom-sheet__content" :class="contentClass">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style>
.bottom-sheet {
  position: fixed;
  inset: auto 0 0 0;
  width: 100%;
  max-width: 100%;
  max-height: calc(100dvh - env(safe-area-inset-top));
  overflow: hidden;
  color: var(--text);
  background: transparent;
  border: none;
  transform: translateY(100%);
  transition:
    opacity 180ms ease-in,
    transform 180ms ease-in,
    overlay 180ms ease-in allow-discrete,
    display 180ms ease-in allow-discrete;
  /* 关闭态 */
  opacity: 0;
}

/* 打开态 */
.bottom-sheet[open] {
  transform: translateY(0);
  transition:
    opacity 250ms ease-out,
    transform 250ms ease-out,
    overlay 250ms ease-out allow-discrete,
    display 250ms ease-out allow-discrete;
  opacity: 1;
  @starting-style {
    transform: translateY(100%);
    opacity: 0;
  }
}

/* 遮罩 */
.bottom-sheet::backdrop {
  background: rgba(0, 0, 0, 0);
  transition:
    background 180ms ease-in,
    overlay 180ms ease-in allow-discrete,
    display 180ms ease-in allow-discrete;
}
.bottom-sheet[open]::backdrop {
  background: rgba(0, 0, 0, var(--backdrop-alpha, 0.5));

  transition:
    background 250ms ease-out,
    overlay 250ms ease-out allow-discrete,
    display 250ms ease-out allow-discrete;

  @starting-style {
    background: rgba(0, 0, 0, 0);
  }
}

/* 内容区 */
.bottom-sheet__body {
  display: flex;
  flex-direction: column;
  max-height: inherit;
  padding: 8px 0 env(safe-area-inset-bottom, 0);
  background: var(--panel);
  border-radius: 16px 16px 0 0;
  will-change: transform;
}

.bottom-sheet__handle {
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  margin: 8px auto 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.bottom-sheet__title {
  flex-shrink: 0;
  padding: 12px 20px 12px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}

.bottom-sheet__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.bottom-sheet__content::-webkit-scrollbar {
  width: 0;
  height: 0;
}
</style>
