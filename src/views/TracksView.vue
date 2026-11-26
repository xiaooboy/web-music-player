<script setup lang="ts">
import { Search } from "@lucide/vue";
import {
  useLibraryStore,
  usePlayerStore,
  useFavoriteStore,
  useUIStore,
  useAlbumStore,
} from "../stores";
import { useTrackSearch } from "../composables/useTrackSearch";
import TrackTable from "@/components/TrackTable.vue";
import SectionHeader from "@/components/SectionHeader.vue";
import EmptyState from "@/components/EmptyState.vue";
import { storeToRefs } from "pinia";

const libraryStore = useLibraryStore();
const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const albumStore = useAlbumStore();
const uiStore = useUIStore();

const { loading, tracks, loadingDone, loadingTotal } =
  storeToRefs(libraryStore);

const { searchQuery, visibleTracks } = useTrackSearch(() => tracks.value);

function handleSelectTrack(id: string) {
  playerStore.setPlaySourceType("tracks");
  playerStore.playTrackById(id, true);
}

function handleNavigateToAlbum(albumName: string) {
  albumStore.selectAlbum(albumName);
  uiStore.setActiveView("album-detail");
}
function handleNavigateToSource() {
  uiStore.setActiveView("sources");
}
</script>

<template>
  <div class="main-panel tracks__view">
    <SectionHeader title="歌曲">
      <template #title>
        <div class="tracks__title-row">
          <h2>歌曲</h2>
          <span
            v-if="loading && tracks.length"
            class="tracks__progress"
            aria-live="polite"
          >
            <template v-if="loadingTotal > 0">
              正在整理曲库 {{ loadingDone }} / {{ loadingTotal }}
            </template>
            <template v-else>
              正在扫描目录...
            </template>
          </span>
        </div>
      </template>
      <template #right>
        <label class="search-field">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="搜索歌曲、歌手、专辑"
            autocomplete="off"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
        </label>
      </template>
    </SectionHeader>

    <TrackTable
      v-if="libraryStore.tracks.length"
      scroll-key="tracks"
      :tracks="visibleTracks"
      :current-track-id="playerStore.currentTrackId"
      :is-playing="playerStore.isPlaying"
      :liked-track-id-set="favoriteStore.likedTrackIdSet"
      @play="handleSelectTrack"
      @toggle-play="playerStore.togglePlay"
      @toggle-favorite="favoriteStore.toggleTrackFavorite"
      @navigate-to-album="handleNavigateToAlbum"
    />
    <EmptyState v-else>
      <p v-if="loading">
        <template v-if="loadingTotal > 0">
          正在整理曲库：已处理 {{ loadingDone }} / {{ loadingTotal }} 首
        </template>
        <template v-else>
          正在扫描音乐目录...
        </template>
      </p>
      <p v-else-if="visibleTracks.length === 0 && searchQuery">没有匹配到结果</p>
      <p v-else>
        前往 <button type="button" class="tracks__source-btn" @click="handleNavigateToSource">音乐源</button> 添加歌曲。
      </p>
    </EmptyState>
  </div>
</template>
