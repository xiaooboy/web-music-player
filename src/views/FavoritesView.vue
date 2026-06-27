<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import { useFavoriteStore } from "../stores/favoriteStore";
import { usePlayerStore } from "../stores/playerStore";
import TrackTable from "@/components/TrackTable.vue";

const favoriteStore = useFavoriteStore();
const playerStore = usePlayerStore();

const searchQuery = ref("");

const visibleTracks = computed(() => {
  if (!searchQuery.value.trim()) return favoriteStore.favoriteTracks;
  const needle = searchQuery.value.trim().toLowerCase();
  return favoriteStore.favoriteTracks.filter((track) => {
    const haystack =
      `${track.title} ${track.artist} ${track.album} ${track.relativePath}`.toLowerCase();
    return haystack.includes(needle);
  });
});

const status = computed(() =>
  favoriteStore.favoriteTracks.length
    ? `${favoriteStore.favoriteTracks.length} 首`
    : "",
);

function handleFavoriteTrackSelect(id: string) {
  playerStore.setPlaySourceType("favorites");
  playerStore.setPlaylist(favoriteStore.favoriteTracks);
  playerStore.playTrackById(id, true);
}

function handleSetNextTrack(id: string) {
  const track = favoriteStore.favoriteTracks.find((t) => t.id === id);
  if (track) playerStore.setNextTrack(track);
}
</script>

<template>
  <div class="all-track-view favorites-view">
    <header class="all-track-searchbar">
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

    <div class="all-track-scroll">
      <TrackTable
        :tracks="visibleTracks"
        :current-track-id="playerStore.currentTrackId"
        :is-playing="playerStore.isPlaying"
        :status="status"
        :liked-track-id-set="favoriteStore.likedTrackIdSet"
        title="收藏"
        empty-title="收藏为空"
        empty-description="点亮心形按钮，这里会自动收集你收藏的音乐。"
        @play="handleFavoriteTrackSelect"
        @toggle-play="playerStore.togglePlay"
        @toggle-favorite="favoriteStore.toggleTrackFavorite"
        @set-next-track="handleSetNextTrack"
      />
    </div>
  </div>
</template>
