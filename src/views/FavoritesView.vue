<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import LibraryPanel from "../components/LibraryPanel.vue";
import { useFavoriteStore } from "../stores/favoriteStore";
import { usePlayerStore } from "../stores/playerStore";

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
    ? `共 ${favoriteStore.favoriteTracks.length} 首喜欢的歌曲`
    : "还没有喜欢的歌曲",
);

function handleFavoriteTrackSelect(id: string) {
  playerStore.setPlaySourceType("favorites");
  playerStore.setPlaylist(favoriteStore.favoriteTracks);
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
          placeholder="搜索喜欢的歌曲、歌手、专辑"
          autocomplete="off"
        />
      </label>
    </header>

    <div class="playlist-scroll">
      <LibraryPanel
        :tracks="visibleTracks"
        :has-tracks="favoriteStore.favoriteTracks.length > 0"
        :loading="false"
        :loading-done="0"
        :loading-total="0"
        :current-track-id="playerStore.currentTrackId"
        :is-playing="playerStore.isPlaying"
        :status="status"
        :liked-track-id-set="favoriteStore.likedTrackIdSet"
        title="喜欢的音乐"
        empty-title="还没有喜欢的歌曲"
        empty-description="在播放列表或播放器里点亮心形按钮，这里会自动收集你喜欢的音乐。"
        @play="handleFavoriteTrackSelect"
        @toggle-favorite="favoriteStore.toggleTrackFavorite"
      />
    </div>
  </div>
</template>
