<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeft } from "@lucide/vue";
import TrackTable from "../components/TrackTable.vue";
import SectionHeader from "../components/SectionHeader.vue";
import { useFavoriteStore, usePlayerStore, usePlaylistStore, useAlbumStore, useUIStore } from "@/stores";
import { useHistoryBack } from "../composables/useHistoryBack";

const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const albumStore = useAlbumStore();
const uiStore = useUIStore();

const isPlaying = computed(() => playerStore.isPlaying);
const playingTrackId = computed(() => playerStore.isPlaying ? playerStore.currentTrackId : "");

function handlePlay(id: string) {
  playlistStore.updatePlayingPlaylist(playlistStore.selectedPlaylistId);
  playerStore.setPlaySourceType("playlists");
  playerStore.playTrackById(id, true);
}

function handleTogglePlay() {
  playerStore.togglePlay();
}

function handleToggleFavorite(id: string) {
  favoriteStore.toggleTrackFavorite(id);
}

function handleNavigateToAlbum(albumName: string) {
  albumStore.selectAlbum(albumName);
  uiStore.setActiveView("album-detail");
}

function navigateBack() {
  playlistStore.clearSelection();
  uiStore.popView();
}

useHistoryBack(navigateBack);


</script>

<template>
  <section v-if="playlistStore.selectedPlaylist" class="main-panel playlist-detail">
    <SectionHeader :title="playlistStore.selectedPlaylist.name">
      <template #left>
        <button class="icon-btn" @click="navigateBack">
          <ArrowLeft :size="20" />
        </button>
      </template>
    </SectionHeader>

    <TrackTable
      :tracks="playlistStore.selectedPlaylistTracks"
      :current-track-id="playingTrackId"
      :is-playing="isPlaying"
      :liked-track-id-set="favoriteStore.likedTrackIdSet"
      empty-title="歌单为空"
      empty-description="通过右键菜单将歌曲添加到这个歌单。"
      @play="handlePlay"
      @toggle-play="handleTogglePlay"
      @toggle-favorite="handleToggleFavorite"
      @navigate-to-album="handleNavigateToAlbum"
    />
  </section>
</template>
