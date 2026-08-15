<script setup lang="ts">
import type { Track } from "@/types";
import { X, Minus } from "@lucide/vue";
import { computed, ref, shallowRef, useTemplateRef, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useMediaQuery } from "@/composables/useMediaQuery";
import BottomSheet from "./BottomSheet.vue";
import type { ComponentExposed } from "vue-component-type-helpers";
const props = defineProps<{
  tracks: Track[];
  currentTrackId: string;
}>();

const emit = defineEmits<{
  play: [index: number];
  remove: [id: string];
}>();

const isSmallScreen = useMediaQuery("(max-width: 640px)");

const ITEM_HEIGHT = 48;
const wasOpen = shallowRef(false);
const listRef = useTemplateRef("listRef");
const sheetRef = ref<ComponentExposed<typeof BottomSheet>>();
const popoverRef = useTemplateRef("popoverRef");

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.tracks.length,
    getScrollElement: () => {
      // 小屏时滚动容器是 BottomSheet 内的 .bottom-sheet__content
      if (isSmallScreen.value && listRef.value) {
        return listRef.value.closest(".bottom-sheet__content");
      }
      return listRef.value;
    },
    estimateSize: () => ITEM_HEIGHT,
    gap: 8,
    overscan: 3,
  })),
);

const virtualItems = computed(() =>
  rowVirtualizer.value.getVirtualItems().map((vRow) => ({
    vRow,
    item: props.tracks[vRow.index],
  })),
);

const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

// 打开时滚动到当前播放曲目
function scrollToCurrentTrack() {
  if (!props.currentTrackId) return;
  const idx = props.tracks.findIndex((t) => t.id === props.currentTrackId);
  if (idx >= 0) {
    rowVirtualizer.value.scrollToIndex(idx, { align: "start" });
  }
}

function handleToggle(event: ToggleEvent) {
  wasOpen.value = event.newState === "open";
  if (!wasOpen.value) return;
  scrollToCurrentTrack();
}

function getWasOpen() {
  return wasOpen.value;
}

// 队列变化时重新测量虚拟行
watch(
  () => props.tracks.length,
  () => rowVirtualizer.value.measure(),
);

function open() {
  if (isSmallScreen.value) {
    sheetRef.value?.open();
    scrollToCurrentTrack();
  } else {
    popoverRef.value?.togglePopover();
  }
}

function close() {
  if (isSmallScreen.value) {
    sheetRef.value?.close();
  } else {
    popoverRef.value?.hidePopover();
  }
}

defineExpose({ open, close, getWasOpen });
</script>

<template>
  <!-- 小屏：BottomSheet -->
  <BottomSheet
    v-if="isSmallScreen"
    ref="sheetRef"
    :title="`播放队列 ( ${tracks.length}首 )`"
    :snap-points="[0.6, 1]"
  >
    <div ref="listRef" class="queue-sheet__list">
      <template v-if="tracks.length">
        <div
          :style="{
            height: `${totalSize}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <li
            v-for="{ vRow, item } in virtualItems"
            :key="item.id"
            class="queue-sheet__item"
            :class="{
              'queue-sheet__item--playing': item.id === currentTrackId,
            }"
            :data-index="vRow.index"
            tabindex="0"
            :aria-label="`${item.title}，${item.artist}`"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${vRow.size}px`,
              transform: `translateY(${vRow.start}px)`,
            }"
            @click="emit('play', vRow.index)"
            @keydown.enter="emit('play', vRow.index)"
          >
            <section class="queue-sheet__track-copy">
              <strong class="queue-sheet__track-title truncate">{{
                item.title
              }}</strong>
              <span class="queue-sheet__track-artist truncate"
                >{{ item.artist }} - {{ item.album }}</span
              >
            </section>
            <button
              class="queue-sheet__remove"
              type="button"
              title="从队列移除"
              aria-label="从队列移除"
              @click.stop="emit('remove', item.id)"
            >
              <Minus :size="20" />
            </button>
          </li>
        </div>
      </template>
      <div v-else class="queue-sheet__empty">播放队列为空</div>
    </div>
  </BottomSheet>

  <!-- 大屏：Popover -->
  <div
    v-else
    ref="popoverRef"
    class="queue-popover"
    popover="auto"
    @toggle="handleToggle"
  >
    <header class="queue-popover__header">
      <span class="queue-popover__title">播放队列 ( {{ tracks.length }}首 )</span>
      <button
        class="queue-popover__close"
        type="button"
        title="关闭播放队列"
        aria-label="关闭播放队列"
        @click="popoverRef?.hidePopover()"
      >
        <X :size="20" />
      </button>
    </header>

    <ul ref="listRef" class="queue-popover__list">
      <template v-if="tracks.length">
        <div
          :style="{
            height: `${totalSize}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <li
            v-for="{ vRow, item } in virtualItems"
            :key="item.id"
            class="queue-popover__item"
            :class="{
              'queue-popover__item--playing': item.id === currentTrackId,
            }"
            :data-index="vRow.index"
            tabindex="0"
            :aria-label="`${item.title}，${item.artist}`"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${vRow.size}px`,
              transform: `translateY(${vRow.start}px)`,
            }"
            @click="emit('play', vRow.index)"
            @keydown.enter="emit('play', vRow.index)"
          >
            <section class="queue-popover__track-copy">
              <strong class="queue-popover__track-title truncate">{{
                item.title
              }}</strong>
              <span class="queue-popover__track-artist truncate"
                >{{ item.artist }} - {{ item.album }}</span
              >
            </section>
            <button
              class="queue-popover__track-remove"
              type="button"
              title="从队列移除"
              aria-label="从队列移除"
              @click.stop="emit('remove', item.id)"
            >
              <Minus :size="20" />
            </button>
          </li>
        </div>
      </template>

      <li v-else class="queue-popover__empty">播放队列为空</li>
    </ul>
  </div>
</template>

<style>
/* 大屏 Popover 样式 */
.queue-popover {
  width: max(320px, 40vw);
  max-height: 320px;
  overflow: hidden;
  background: rgba(32, 32, 32, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(12px);
}

.queue-popover__header {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.queue-popover__title {
  font-weight: 600;
  color: var(--muted);
}

.queue-popover__close {
  margin-left: auto;
  padding: 4px;
  color: var(--muted, #888);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}

.queue-popover__close:hover {
  color: var(--text, #fff);
  background: rgba(255, 255, 255, 0.1);
}

.queue-popover__list {
  min-height: 80px;
  max-height: 260px;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
}

.queue-popover__item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.queue-popover__item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.queue-popover__track-title {
  flex: 1;
  font-size: var(--text-sm);
}

.queue-popover__track-artist,
.queue-sheet__track-artist {
  flex: 1;
}

.queue-popover__track-remove {
  padding: 4px;
  color: var(--muted, #888);
  background: transparent;
  border-radius: 4px;
  transition: opacity 100ms ease;
  cursor: pointer;
}

.queue-popover__track-remove:hover {
  color: var(--text, #fff);
  background: rgba(255, 255, 255, 0.1);
}

.queue-popover__empty {
  padding: 32px 16px;
  font-size: var(--text-sm);
  color: var(--muted, #888);
  text-align: center;
}

/* 小屏 BottomSheet 样式 */
.queue-sheet__list {
  min-height: 80px;
  padding: 4px 8px;
  list-style: none;
}
.queue-sheet__list,
.queue-popover__list {
  span {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  strong {
    font-weight: 700;
  }
}
.queue-sheet__item--playing,
.queue-popover__item--playing {
  strong {
    color: var(--accent);
  }
  span {
    color: var(--accent-light);
  }
}
.queue-sheet__item {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 48px;
  padding: 0 10px;
  border-radius: 10px;
  cursor: pointer;
}

.queue-sheet__item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.queue-popover__track-copy,
.queue-sheet__track-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}
.queue-sheet__item--playing .queue-sheet__title {
  font-weight: 600;
}

.queue-sheet__title,
.queue-sheet__artist {
  flex: 1;
}

.queue-sheet__remove {
  padding: 8px;
  color: var(--muted);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
}

.queue-sheet__remove:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}

.queue-sheet__empty {
  padding: 32px 16px;
  font-size: var(--text-sm);
  color: var(--muted);
  text-align: center;
}
</style>
