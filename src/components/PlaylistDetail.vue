<script setup lang="ts">
import { ArrowLeft, Play } from "@lucide/vue";
import { computed } from "vue";
import { useFavoriteStore, usePlayerStore, usePlaylistStore, useAlbumStore, useUIStore } from "@/stores";
import TrackTable from "./TrackTable.vue";
import SectionHead from "./SectionHead.vue";
import type { Playlist, Track } from "@/types";

interface Props {
  playlist: Playlist;
  tracks: Track[];
  playingTrackId: string;
  viewTransitionName?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "back"): void;
}>();

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const playlistStore = usePlaylistStore();
const albumStore = useAlbumStore();
const uiStore = useUIStore();

const isPlaying = computed(() => playerStore.isPlaying);

function handlePlay(id: string) {
  playlistStore.updatePlayingPlaylist(props.playlist.id);
  playerStore.setPlaySourceType("playlists");
  playerStore.playTrackById(id, true);
}

function handlePlayPlaylist() {
  playlistStore.updatePlayingPlaylist(props.playlist.id);
  playerStore.setPlaySourceType("playlists");
  playerStore.playTrack(0, true);
}

function handleTogglePlay() {
  playerStore.togglePlay();
}

function handleToggleFavorite(id: string) {
  favoriteStore.toggleTrackFavorite(id);
}

function handleNavigateToAlbum(albumName: string) {
  uiStore.setActiveSection("albums");
  albumStore.selectAlbum(albumName);
}
</script>

<template>
  <section class="playlist-detail-view">
    <SectionHead :title="playlist.name">
      <template #title>
        <h2>
          <span :style="{ 'view-transition-name': viewTransitionName }">{{
            playlist.name
          }}</span>
        </h2>
      </template>
      <template #left>
        <button class="icon-button back-button" @click="emit('back')">
          <ArrowLeft :size="20" />
        </button>
      </template>
    </SectionHead>

    <TrackTable
      :tracks="tracks"
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
