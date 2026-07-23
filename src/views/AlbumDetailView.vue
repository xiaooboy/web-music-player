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
import { ensureCoverUrl } from "../utils/coverCache";

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
  <section v-if="albumStore.selectedAlbum" class="main-panel album-detail">
    <div class="album-detail__head">
      <button
        class="icon-button back-button"
        type="button"
        @click="navigateBack"
      >
        <ArrowLeft :size="20" />
      </button>
      <div class="album-detail__cover">
        <img
          v-if="ensureCoverUrl(albumStore.selectedAlbum.name, albumStore.selectedAlbum.coverBlob)"
          :src="ensureCoverUrl(albumStore.selectedAlbum.name, albumStore.selectedAlbum.coverBlob)"
          class="img-fadein img-fadein--loaded"
          :alt="`${albumStore.selectedAlbum.name} 封面`"
        />
        <Disc3 v-else :size="34" />
      </div>
      <div class="album-detail__copy">
        <h3>{{ albumStore.selectedAlbum.name }}</h3>
        <span>{{ albumStore.selectedAlbum.artistLabel }}</span>
        <div class="album-detail__stats">
          <span>{{ albumStore.selectedAlbum.tracks.length }} 首</span>
          <span>{{ formatTime(albumStore.selectedAlbum.duration) }}</span>
        </div>
      </div>
      <button
        class="primary-button album-detail__play-button"
        type="button"
        @click="handlePlayAlbum"
      >
        <Play :size="20" />
        <span>播放专辑</span>
      </button>
    </div>

    <div class="album-detail__song-list">
      <button
        v-for="(track, songOrder) in albumStore.selectedAlbum.tracks"
        :key="track.id"
        class="album-detail__song-row"
        :class="{ 'album-detail__song-row--active': track.id === playingTrackId }"
        type="button"
        @click="handlePlayTrack(track.id)"
        @contextmenu="handleContextMenu($event, track)"
      >
        <div class="album-detail__song-main">
          <div
            class="album-detail__song-icon"
            :class="{
              'album-detail__song-icon--playing': track.id === playingTrackId,
            }"
          >
            <Pause
              v-if="track.id === playingTrackId"
              @click.stop="handleStop()"
              :size="20"
            />
            <Play v-else :size="20" />
          </div>
          <div class="album-detail__song-copy">
            <strong class="truncate--block">{{ songOrder + 1 }}. {{ track.title }}</strong>
            <span class="truncate--block">{{ track.artist || "未知歌手" }}</span>
          </div>
        </div>
        <div class="album-detail__song-actions">
          <span class="album-detail__song-duration">{{
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
