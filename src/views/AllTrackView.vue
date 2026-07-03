<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef } from "vue";
import { Search } from "lucide-vue-next";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlayerStore } from "../stores/playerStore";
import { useFavoriteStore } from "../stores/favoriteStore";
import { useTrackSearch } from "../composables/useTrackSearch";
import TrackTable from "@/components/TrackTable.vue";

const libraryStore = useLibraryStore();
const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();

const launchTimerId = setTimeout(() => {
  launchTimer.value = false;
}, 100);
const launchTimer = shallowRef(true);

onBeforeUnmount(() => {
  clearTimeout(launchTimerId);
});

const { searchQuery, visibleTracks } = useTrackSearch(
  () => libraryStore.tracks,
);

const playlistStatus = computed(() => {
  if (libraryStore.tracks.length) {
    return `${libraryStore.tracks.length} 首`;
  }
  return "";
});
const emptyTitle = computed(() => {
  const { loading, tracks } = libraryStore;
  // 避免闪烁
  if (launchTimer.value) return "";
  if (loading) return "正在整理曲库";
  if (tracks.length) return "没有匹配到结果";
  return "本地曲库未接入";
});
const emptyDescription = computed(() => {
  const { loading, loadingDone, loadingTotal, tracks } = libraryStore;
  // 避免闪烁
  if (launchTimer.value) return "";
  if (loading)
    return `已处理 ${loadingDone} / ${loadingTotal} 首歌曲，请稍候。`;
  if (tracks.length) return "没有匹配到结果";
  return '前往"音乐源"添加。';
});

function handleSelectTrack(id: string) {
  playerStore.setPlaySourceType("all-track");
  playerStore.playTrackById(id, true);
}
</script>

<template>
  <div class="all-track-view">
    <header class="all-track-searchbar">
      <label class="search-field">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="搜索歌曲、歌手、专辑"
          autocomplete="off"
        />
      </label>
    </header>

    <div class="all-track-scroll">
      <TrackTable
        title="歌曲"
        :status="playlistStatus"
        :tracks="visibleTracks"
        :current-track-id="playerStore.currentTrackId"
        :is-playing="playerStore.isPlaying"
        :empty-title="emptyTitle"
        :empty-description="emptyDescription"
        :liked-track-id-set="favoriteStore.likedTrackIdSet"
        @play="handleSelectTrack"
        @toggle-play="playerStore.togglePlay"
        @toggle-favorite="favoriteStore.toggleTrackFavorite"
      />
    </div>
  </div>
</template>
