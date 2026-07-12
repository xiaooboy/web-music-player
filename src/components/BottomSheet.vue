<script setup lang="ts">
import { useTemplateRef, onMounted, onBeforeUnmount } from "vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    /**
     * 锚点比例数组（基于视口高度），如 [0.5, 1] 表示半屏和全屏
     * - 多个锚点：可上拉/下拉切换高度，下拉超限关闭
     * - 单个锚点：高度适应内容，不可上拉扩展，只可下拉关闭
     * - 空数组或不传：高度适应内容，不可拖拽调整
     * 默认 [0.5, 1]
     */
    snapPoints?: number[];
  }>(),
  { snapPoints: () => [0.5, 1] },
);

const dialogRef = useTemplateRef("dialogRef");
const bodyRef = useTemplateRef("bodyRef");

// ─── 模式判定 ──────────────────────────────────────────────────────────────
/** 是否有可切换的锚点（≥2 个才允许拖拽调整高度） */
const hasResizableSnaps = () => props.snapPoints.length >= 2;

// ─── Snap points ─────────────────────────────────────────────────────────
let currentSnapIndex = 0;
let dragStartHeight = 0;
let touchStartY = 0;
let isDragging = false;
let dragOpacity = 1;

const sortedSnaps = () => [...props.snapPoints].sort((a, b) => a - b);
function snapToHeight(ratio: number) {
  return Math.round(ratio * window.innerHeight);
}

function nearestSnapIndex(heightPx: number) {
  const dvh = window.innerHeight;
  let best = 0;
  let bestDist = Infinity;
  const snaps = sortedSnaps();
  for (let i = 0; i < snaps.length; i++) {
    const dist = Math.abs(heightPx - snaps[i] * dvh);
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
  const height = snapToHeight(sortedSnaps()[index]);
  if (animate) {
    body.style.transition = "height 300ms cubic-bezier(0.32, 0.72, 0, 1)";
    body.addEventListener(
      "transitionend",
      () => {
        if (bodyRef.value) bodyRef.value.style.transition = "";
      },
      { once: true },
    );
  }
  body.style.height = `${height}px`;
}

// ─── 触摸拖拽 ─────────────────────────────────────────────────────────────
function handleTouchStart(e: TouchEvent) {
  // 触摸在可滚动内容内部且未到顶时，不拦截
  const scrollEl = bodyRef.value?.querySelector(".bottom-sheet-content");
  if (
    scrollEl instanceof HTMLElement &&
    scrollEl.scrollTop > 0 &&
    scrollEl.contains(e.target as Node)
  )
    return;

  touchStartY = e.touches[0].clientY;
  dragStartHeight = bodyRef.value?.offsetHeight ?? 0;
  isDragging = true;
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging || !bodyRef.value || !dialogRef.value) return;
  const deltaY = e.touches[0].clientY - touchStartY;

  // ─── 适应内容模式（单锚点或无锚点）：只允许下拉关闭 ────
  if (!hasResizableSnaps()) {
    if (deltaY <= 0) return; // 上拉不处理
    e.preventDefault();
    const damped = deltaY * 0.6;
    bodyRef.value.style.transition = "none";
    bodyRef.value.style.transform = `translateY(${damped}px)`;
    const progress = Math.min(deltaY / 80, 1);
    dragOpacity = 1 - progress * 0.6;
    updateBackdropOpacity();
    return;
  }

  // ─── 锚点模式：拖拽调整高度 ──────────────────────────────
  const newHeight = dragStartHeight - deltaY;
  const minSnapHeight = snapToHeight(sortedSnaps()[0]);

  if (newHeight < minSnapHeight) {
    // 低于最小锚点，阻尼跟随
    const overflow = minSnapHeight - newHeight;
    const damped = minSnapHeight - overflow * 0.4;
    bodyRef.value.style.transition = "none";
    bodyRef.value.style.height = `${damped}px`;
    const progress = Math.min(overflow / 80, 1);
    dragOpacity = 1 - progress * 0.6;
    updateBackdropOpacity();
    return;
  }

  const clampedHeight = Math.min(newHeight, window.innerHeight);
  e.preventDefault();
  bodyRef.value.style.transition = "none";
  bodyRef.value.style.height = `${clampedHeight}px`;
  dragOpacity = 1;
  updateBackdropOpacity();
}

function handleTouchEnd() {
  if (!isDragging || !bodyRef.value || !dialogRef.value) return;
  isDragging = false;

  // ─── 适应内容模式：translateY 拖拽 ───────────────────────
  if (!hasResizableSnaps()) {
    const currentY = parseFloat(
      bodyRef.value.style.transform.match(/translateY\((.+)px\)/)?.[1] ?? "0",
    );
    if (currentY > 48) {
      close();
      return;
    }
    // 弹回
    dragOpacity = 1;
    dialogRef.value?.style.removeProperty("--backdrop-alpha");
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

  // ─── 锚点模式：height 拖拽 ───────────────────────────────
  const currentHeight = bodyRef.value.offsetHeight;
  const minSnapHeight = snapToHeight(sortedSnaps()[0]);

  if (currentHeight < minSnapHeight) {
    const overflow = minSnapHeight - currentHeight;
    if (overflow > 60) {
      close();
      return;
    }
    snapTo(0);
    resetBackdrop();
    return;
  }

  const idx = nearestSnapIndex(currentHeight);
  snapTo(idx);
  resetBackdrop();
}

function resetBackdrop() {
  dragOpacity = 1;
  dialogRef.value?.style.removeProperty("--backdrop-alpha");
}

// ─── 遮罩透明度 ────────────────────────────────────────────────────────────
function updateBackdropOpacity() {
  dialogRef.value?.style.setProperty("--backdrop-alpha", `${0.5 * dragOpacity}`);
}

// ─── 非被动触摸事件 ────────────────────────────────────────────────────────
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
    // 锚点模式：打开后设置初始锚点高度
    requestAnimationFrame(() => snapTo(0, false));
  }
  // 适应内容模式：不设 height，内容自适应
}

function close() {
  dialogRef.value?.close();
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === dialogRef.value) close();
}

defineExpose({ open, close });
</script>

<template>
  <dialog ref="dialogRef" class="bottom-sheet" @click="handleBackdropClick">
    <div
      ref="bodyRef"
      class="bottom-sheet-body"
      @click.stop
      @touchstart="handleTouchStart"
      @touchend="handleTouchEnd"
    >
      <div class="bottom-sheet-handle" aria-hidden="true" />
      <div v-if="title" class="bottom-sheet-title">{{ title }}</div>
      <div class="bottom-sheet-content">
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
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 16px 16px 0 0;
  background: transparent;
  overflow: visible;
  color: var(--text);

  /* 关闭态 */
  opacity: 0;
  transform: translateY(100%);
  transition:
    opacity 180ms ease-in,
    transform 180ms ease-in,
    overlay 180ms ease-in allow-discrete,
    display 180ms ease-in allow-discrete;
}

/* 打开态 */
.bottom-sheet[open] {
  opacity: 1;
  transform: translateY(0);

  transition:
    opacity 250ms ease-out,
    transform 250ms ease-out,
    overlay 250ms ease-out allow-discrete,
    display 250ms ease-out allow-discrete;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
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
.bottom-sheet-body {
  max-height: calc(100dvh - env(safe-area-inset-top));
  background: var(--panel);
  border-radius: 16px 16px 0 0;
  padding: 8px 0 env(safe-area-inset-bottom, 0);
  display: flex;
  flex-direction: column;
  will-change: height, transform;
}

.bottom-sheet-handle {
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
  margin: 8px auto 4px;
}

.bottom-sheet-title {
  flex-shrink: 0;
  padding: 12px 20px 12px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}

.bottom-sheet-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.bottom-sheet-content::-webkit-scrollbar {
  width: 0;
  height: 0;
}
</style>
