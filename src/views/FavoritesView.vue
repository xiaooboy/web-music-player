<script setup lang="ts">
import { computed } from "vue";
import { Search } from "@lucide/vue";
import { useFavoriteStore } from "../stores/favoriteStore";
import { usePlayerStore } from "../stores/playerStore";
import { useAlbumStore } from "../stores/albumStore";
import { useUIStore } from "../stores/uiStore";
import { useTrackSearch } from "../composables/useTrackSearch";
import TrackTable from "@/components/TrackTable.vue";
import SectionHeader from "@/components/SectionHeader.vue";
import EmptyState from "@/components/EmptyState.vue";

const favoriteStore = useFavoriteStore();
const playerStore = usePlayerStore();
const albumStore = useAlbumStore();
const uiStore = useUIStore();

const { searchQuery, visibleTracks } = useTrackSearch(
  () => favoriteStore.favoriteTracks,
);

const status = computed(() =>
  favoriteStore.favoriteTracks.length
    ? `${favoriteStore.favoriteTracks.length} 首`
    : "",
);

function handleFavoriteTrackSelect(id: string) {
  playerStore.setPlaySourceType("favorites");
  playerStore.playTrackById(id, true);
}

function handleNavigateToAlbum(albumName: string) {
  albumStore.selectAlbum(albumName);
  uiStore.setActiveView("album-detail");
}
</script>

<template>
  <div class="main-panel tracks__view favorites-view">
    <header class="tracks__searchbar">
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

    <SectionHeader title="收藏" />

    <TrackTable
      v-if="favoriteStore.favoriteTracks.length"
      :tracks="visibleTracks"
      :current-track-id="playerStore.currentTrackId"
      :is-playing="playerStore.isPlaying"
      :liked-track-id-set="favoriteStore.likedTrackIdSet"
      empty-title=""
      empty-description=""
      @play="handleFavoriteTrackSelect"
      @toggle-play="playerStore.togglePlay"
      @toggle-favorite="favoriteStore.toggleTrackFavorite"
      @navigate-to-album="handleNavigateToAlbum"
    />
    <EmptyState
      v-else
      title="收藏为空"
      content="点亮心形按钮，收藏音乐。"
    ></EmptyState>
  </div>
</template>
