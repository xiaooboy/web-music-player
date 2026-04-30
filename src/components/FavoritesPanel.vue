<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import LibraryPanel from "./LibraryPanel.vue";
import type { Track } from "../types";

const props = defineProps<{
  tracks: Array<{ track: Track; index: number }>;
  currentTrackIndex: number;
  isPlaying: boolean;
  likedTrackIdSet: Set<string>;
}>();

const emit = defineEmits<{
  play: [index: number];
  toggleFavorite: [index: number];
}>();

const searchQuery = ref("");
const isScrolling = ref(false);
let scrollHideTimer: ReturnType<typeof setTimeout> | null = null;

const visibleTracks = computed(() => {
  if (!searchQuery.value.trim()) return props.tracks;
  const needle = searchQuery.value.trim().toLowerCase();
  return props.tracks.filter(({ track }) => {
    const haystack =
      `${track.title} ${track.artist} ${track.album} ${track.relativePath}`.toLowerCase();
    return haystack.includes(needle);
  });
});

const status = computed(() =>
  props.tracks.length
    ? `共 ${props.tracks.length} 首喜欢的歌曲`
    : "还没有喜欢的歌曲",
);

function handleScroll() {
  isScrolling.value = true;
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => {
    isScrolling.value = false;
  }, 700);
}
</script>

<template>
  <div class="playlist-stage">
    <header class="playlist-searchbar">
      <label class="search-field">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="搜索喜欢的歌曲、歌手、专辑"
          autocomplete="off"
        />
      </label>
    </header>

    <div
      class="playlist-scroll"
      :class="{ 'is-scrolling': isScrolling }"
      @scroll.passive="handleScroll"
    >
      <LibraryPanel
        :tracks="visibleTracks"
        :has-tracks="tracks.length > 0"
        :loading="false"
        :loading-done="0"
        :loading-total="0"
        :current-track-index="currentTrackIndex"
        :is-playing="isPlaying"
        :status="status"
        :liked-track-id-set="likedTrackIdSet"
        title="喜欢的音乐"
        empty-title="还没有喜欢的歌曲"
        empty-description="在播放列表或播放器里点亮心形按钮，这里会自动收集你喜欢的音乐。"
        @play="emit('play', $event)"
        @toggle-favorite="emit('toggleFavorite', $event)"
      />
    </div>
  </div>
</template>
