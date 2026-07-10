<script setup lang="ts">
import type { Track } from "@/types";
import { X, Minus } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import "@/styles/popover.css";

const props = defineProps<{
  tracks: Track[];
  currentTrackId: string;
}>();

const emit = defineEmits<{
  play: [index: number];
  remove: [id: string];
}>();

const ITEM_HEIGHT = 40;
const listRef = ref<HTMLElement | null>(null);

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.tracks.length,
    getScrollElement: () => listRef.value,
    estimateSize: () => ITEM_HEIGHT,
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
function handleToggle(event: ToggleEvent) {
  if (event.newState !== "open") return;
  if (!props.currentTrackId) return;
  const idx = props.tracks.findIndex((t) => t.id === props.currentTrackId);
  if (idx >= 0) {
    rowVirtualizer.value.scrollToIndex(idx, { align: "start" });
  }
}

// 队列变化时重新测量虚拟行
watch(
  () => props.tracks.length,
  () => rowVirtualizer.value.measure(),
);
</script>

<template>
  <div class="queue-popover" popover="auto" @toggle="handleToggle">
    <header class="popover-header">
      <span class="popover-title">播放队列</span>
      <span class="popover-count">({{ tracks.length }}首)</span>
      <button
        class="popover-close"
        type="button"
        title="关闭播放队列"
        aria-label="关闭播放队列"
        :popovertarget="($attrs.id as string) || undefined"
        popovertargetaction="hide"
      >
        <X :size="16"/>
      </button>
    </header>

    <ul ref="listRef" class="popover-list">
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
            class="popover-item"
            :class="{ 'is-playing': item.id === currentTrackId }"
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
            <span class="track-title">{{ item.title }}</span>
            <span class="track-artist">{{ item.artist }}</span>
            <button
              class="track-remove"
              type="button"
              title="从队列移除"
              aria-label="从队列移除"
              @click.stop="emit('remove', item.id)"
            >
              <Minus :size="14" />
            </button>
          </li>
        </div>
      </template>

      <li v-else class="popover-empty">播放队列为空</li>
    </ul>
  </div>
</template>

<style>
.queue-popover {
  padding: 0;
  border-radius: 12px;
  background: rgba(32, 32, 32, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.48);
  width: min(340px, calc(100vw - 24px));
  max-height: 320px;
  overflow: hidden;
}

.popover-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.popover-title {
  font-weight: 600;
  font-size: 0.95rem;
}

.popover-count {
  color: var(--muted, #888);
  font-size: 0.85rem;
}

.popover-close {
  margin-left: auto;
  padding: 4px;
  border-radius: 6px;
  background: transparent;
  color: var(--muted, #888);
  cursor: pointer;
}

.popover-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text, #fff);
}

.popover-list {
  overflow-y: auto;
  max-height: 260px;
  min-height: 80px;
  padding: 6px;
  margin: 0;
  list-style: none;
}

.popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
}

.popover-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.popover-item.is-playing {
  color: var(--accent, #646cff);
}

.popover-item.is-playing .track-title {
  font-weight: 600;
}

.track-title {
  flex: 1;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-artist {
  flex: 1;
  font-size: 0.8rem;
  color: var(--muted, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-remove {
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #888);
  transition: opacity 100ms ease;
  cursor: pointer;
}

.track-remove:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text, #fff);
}

.popover-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--muted, #888);
  font-size: 0.9rem;
}
</style>
