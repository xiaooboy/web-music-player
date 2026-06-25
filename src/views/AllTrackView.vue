<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlayerStore } from "../stores/playerStore";
import { useFavoriteStore } from "../stores/favoriteStore";
import TrackTable from "@/components/TrackTable.vue";

const libraryStore = useLibraryStore();
const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();

const searchQuery = ref("");

const visibleTracks = computed(() => {
  if (!searchQuery.value.trim()) return libraryStore.tracks;
  const needle = searchQuery.value.trim().toLowerCase();
  return libraryStore.tracks.filter((track) => {
    const haystack =
      `${track.title} ${track.artist} ${track.album} ${track.relativePath}`.toLowerCase();
    return haystack.includes(needle);
  });
});

const playlistStatus = computed(() => {
  if (libraryStore.tracks.length) {
    return `${libraryStore.tracks.length} 首歌曲`;
  }
  return "";
});
const emptyTitle = computed(() => {
  if (libraryStore.loading) return "正在整理曲库";
  if (libraryStore.tracks.length) return "没有匹配到结果";
  return "本地曲库未接入";
});
const emptyDescription = computed(() => {
  if (libraryStore.loading)
    return `已处理 ${libraryStore.loadingDone} / ${libraryStore.loadingTotal} 首歌曲，请稍候。`;
  if (libraryStore.tracks.length) return "没有匹配到结果";
  return '前往"音乐源"添加。';
});

function handleSelectTrack(id: string) {
  playerStore.setPlaySourceType("all-track");
  playerStore.setPlaylist(libraryStore.tracks);
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
