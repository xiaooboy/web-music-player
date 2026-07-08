<script setup lang="ts">
import type { Track } from "@/types";
import { X } from "@lucide/vue";
import { ref } from "vue";
import "@/styles/popover.css";

const props = defineProps<{
  tracks: Track[];
  currentTrackId: string;
}>();

const emit = defineEmits<{
  play: [index: number];
  remove: [id: string];
}>();

const listRef = ref<HTMLElement | null>(null);

function handleToggle(event: ToggleEvent) {
  if (event.newState !== "open") return;
  if (!props.currentTrackId || !listRef.value) return;

  const playingItem = listRef.value.querySelector<HTMLLIElement>(".is-playing");
  if (playingItem) {
    playingItem.scrollIntoView({ block: "start" });
  }
}
</script>

<template>
  <div class="queue-popover" popover="auto" @toggle="handleToggle">
    <header class="popover-header">
      <span class="popover-title">播放队列</span>
      <span class="popover-count">({{ tracks.length }}首)</span>
      <button
        class="popover-close"
        type="button"
        :popovertarget="($attrs.id as string) || undefined"
        popovertargetaction="hide"
      >
        <X :size="16" />
      </button>
    </header>

    <ul ref="listRef" class="popover-list">
      <li
        v-for="(track, index) in tracks"
        :key="track.id"
        class="popover-item"
        :class="{ 'is-playing': track.id === currentTrackId }"
        @click="emit('play', index)"
      >
        <span class="track-title">{{ track.title }}</span>
        <span class="track-artist">{{ track.artist }}</span>
        <button
          class="track-remove"
          type="button"
          title="从队列移除"
          @click.stop="emit('remove', track.id)"
        >
          <X :size="14" />
        </button>
      </li>

      <li v-if="!tracks.length" class="popover-empty">播放队列为空</li>
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
  padding: 6px;
  margin: 0;
  list-style: none;
}

.popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
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
  opacity: 0;
  transition: opacity 100ms ease;
  cursor: pointer;
}

.popover-item:hover .track-remove {
  opacity: 1;
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
