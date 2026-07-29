<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef } from "vue";
import { Search } from "@lucide/vue";
import {
  useLibraryStore,
  usePlayerStore,
  useFavoriteStore,
  useUIStore,
  useAlbumStore
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

setTimeout(() => {
  launchTimer.value = false;
}, 300);
const launchTimer = shallowRef(true);
const { loading, tracks, loadingDone, loadingTotal } =
  storeToRefs(libraryStore);

const { searchQuery, visibleTracks } = useTrackSearch(() => tracks.value);

const emptyTitle = computed(() => {
  // 避免闪烁
  if (launchTimer.value) return "";
  if (loading.value) return "正在整理曲库";
  if (visibleTracks.value.length) return "没有匹配到结果";
  return "本地曲库未接入";
});

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
    <header class="tracks__searchbar">
      <label class="search-field">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="搜索歌曲、歌手、专辑"
          autocomplete="off"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </label>
    </header>
    <SectionHeader title="歌曲" />
    <TrackTable
      v-if="libraryStore.tracks.length"
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
      <template #title v-if="!launchTimer">
        <strong>
          {{ loading ? "正在整理曲库" : !tracks.length ? "本地曲库未接入" : "" }}
        </strong>
      </template>
      <template #content v-if="!launchTimer">
        <p v-if="loading">
          {{ `已处理 ${loadingDone} / ${loadingTotal} 首歌曲。` }}
        </p>
        <p v-else-if="visibleTracks.length">没有匹配到结果</p>
        <p v-else-if="!tracks.length">
          前往 <span class="tracks__source-btn" @click="handleNavigateToSource">音乐源</span> 添加歌曲。
        </p>
      </template>
    </EmptyState>
  </div>
</template>
