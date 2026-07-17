<script setup lang="ts">
import { ref, computed } from "vue";
import { ArrowLeft, Disc3, MoreVertical, Pause, Play } from "@lucide/vue";
import { formatTime } from "../utils/media";
import type { Track } from "@/types";
import ContextMenu from "../components/ContextMenu.vue";
import ActionSheet from "../components/ActionSheet.vue";
import { useTrackContextMenu } from "../composables/useTrackContextMenu";
import { useHistoryBack } from "../composables/useHistoryBack";
import { usePlayerStore, useAlbumStore, useUIStore } from "@/stores";

const albumStore = useAlbumStore();
const playerStore = usePlayerStore();
const uiStore = useUIStore();

const playingTrackId = computed(() => playerStore.isPlaying ? playerStore.currentTrackId : "");

const { menuProps, open: openContextMenu, isSmallScreen } = useTrackContextMenu();
const contextMenuHeader = ref("");

function handleContextMenu(
  event: MouseEvent,
  track: Track,
) {
  event.preventDefault();
  event.stopPropagation();
  contextMenuHeader.value = track.title;
  openContextMenu(track, event);
}

function handlePlayTrack(trackId: string) {
  albumStore.updatePlayingAlbum(albumStore.selectedAlbumName);
  playerStore.setPlaySourceType("albums");
  playerStore.playTrackById(trackId, true);
}

function handlePlayAlbum() {
  albumStore.updatePlayingAlbum(albumStore.selectedAlbumName);
  playerStore.setPlaySourceType("albums");
  playerStore.playTrack(0, true);
}

function handleStop() {
  playerStore.togglePlay();
}

function navigateBack() {
  albumStore.clearSelection();
  uiStore.popView();
}

useHistoryBack(navigateBack);


</script>

<template>
  <section v-if="albumStore.selectedAlbum" class="main-panel album-detail-view">
    <div class="album-detail-head">
      <button
        class="icon-button back-button"
        type="button"
        @click="navigateBack"
      >
        <ArrowLeft :size="20" />
      </button>
      <div class="album-detail-cover">
        <img
          v-if="albumStore.selectedAlbum.coverUrl"
          :src="albumStore.selectedAlbum.coverUrl"
          class="img-fadein is-loaded"
          :alt="`${albumStore.selectedAlbum.name} 封面`"
        />
        <Disc3 v-else :size="34" />
      </div>
      <div class="album-detail-copy">
        <h3>{{ albumStore.selectedAlbum.name }}</h3>
        <span>{{ albumStore.selectedAlbum.artistLabel }}</span>
        <div class="album-detail-stats">
          <span>{{ albumStore.selectedAlbum.tracks.length }} 首</span>
          <span>{{ formatTime(albumStore.selectedAlbum.duration) }}</span>
        </div>
      </div>
      <button
        class="primary-button album-play-button"
        type="button"
        @click="handlePlayAlbum"
      >
        <Play :size="20" />
        <span>播放专辑</span>
      </button>
    </div>

    <div class="album-song-list">
      <button
        v-for="(track, songOrder) in albumStore.selectedAlbum.tracks"
        :key="track.id"
        class="album-song-row"
        :class="{ 'is-active': track.id === playingTrackId }"
        type="button"
        @click="handlePlayTrack(track.id)"
        @contextmenu="handleContextMenu($event, track)"
      >
        <div class="album-song-main">
          <div
            class="album-song-icon"
            :class="{
              'is-playing': track.id === playingTrackId,
            }"
          >
            <Pause
              v-if="track.id === playingTrackId"
              @click.stop="handleStop()"
              :size="20"
            />
            <Play v-else :size="20" />
          </div>
          <div class="album-song-copy">
            <strong>{{ songOrder + 1 }}. {{ track.title }}</strong>
            <span>{{ track.artist || "未知歌手" }}</span>
          </div>
        </div>
        <div class="album-song-actions">
          <span class="album-song-duration">{{
            formatTime(track.duration)
          }}</span>
          <button
            class="track-row-more"
            type="button"
            title="更多"
            @click.stop="handleContextMenu($event, track)"
          >
            <MoreVertical :size="20" />
          </button>
        </div>
      </button>
    </div>

    <ContextMenu v-if="!isSmallScreen" ref="contextMenu" v-bind="menuProps" />
    <ActionSheet v-else ref="actionSheet" v-bind="menuProps" />
  </section>
</template>
