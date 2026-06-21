<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import LibraryPanel from "../components/LibraryPanel.vue";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlayerStore } from "../stores/playerStore";
import { useFavoriteStore } from "../stores/favoriteStore";

const libraryStore = useLibraryStore();
const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();

const searchQuery = ref("");
const isScrolling = ref(false);
let scrollHideTimer: ReturnType<typeof setTimeout> | null = null;

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
    return `共 ${libraryStore.tracks.length} 首歌曲`;
  }
  return libraryStore.libraryStatus;
});

function handleScroll() {
  isScrolling.value = true;
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => {
    isScrolling.value = false;
  }, 700);
}

function handleSelectTrack(id: string) {
  playerStore.setPlaySourceType("playlist");
  playerStore.setPlaylist(libraryStore.tracks);
  playerStore.playTrackById(id, true);
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
          placeholder="搜索歌曲、歌手、专辑"
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
        :has-tracks="libraryStore.tracks.length > 0"
        :loading="libraryStore.loading"
        :loading-done="libraryStore.loadingDone"
        :loading-total="libraryStore.loadingTotal"
        :current-track-id="playerStore.currentTrackId"
        :is-playing="playerStore.isPlaying"
        :status="playlistStatus"
        :liked-track-id-set="favoriteStore.likedTrackIdSet"
        @play="handleSelectTrack"
        @toggle-favorite="favoriteStore.toggleTrackFavorite"
      />
    </div>
  </div>
</template>
