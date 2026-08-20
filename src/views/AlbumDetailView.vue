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
import SectionHeader from "@/components/SectionHeader.vue";
const albumStore = useAlbumStore();
const playerStore = usePlayerStore();
const uiStore = useUIStore();

const playingTrackId = computed(() => playerStore.isPlaying ? playerStore.currentTrackId : "");

const isCurrentAlbumPlaying = computed(
  () => albumStore.playingAlbumName === albumStore.selectedAlbumName && playerStore.isPlaying,
);

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
  if (isCurrentAlbumPlaying.value) {
    playerStore.togglePlay();
    return;
  }
  albumStore.updatePlayingAlbum(albumStore.selectedAlbumName);
  playerStore.setPlaySourceType("albums");
  playerStore.playTrack(0, true);
}

function navigateBack() {
  albumStore.clearSelection();
  uiStore.popView();
}

useHistoryBack(navigateBack);


</script>

<template>
  <section v-if="albumStore.selectedAlbum" class="album-detail scroll-borrow">
    <SectionHeader>
      <template #left>
        <button class="icon-btn" @click="navigateBack">
          <ArrowLeft :size="20" />
        </button>
      </template>
    </SectionHeader>
    <div class="album-detail__head">
      <div class="album-detail__cover">
        <img
          v-if="ensureCoverUrl(albumStore.selectedAlbum.name, albumStore.selectedAlbum.coverBlob)"
          draggable="false"
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
        class="icon-btn--sized album-detail__play-button"
        :class="{ 'album-detail__play-button--playing': isCurrentAlbumPlaying }"
        type="button"
        :title="isCurrentAlbumPlaying ? '暂停' : '播放'"
        :aria-label="isCurrentAlbumPlaying ? '暂停' : '播放'"
        @click="handlePlayAlbum"
      >
        <Pause v-if="isCurrentAlbumPlaying" :size="20" />
        <Play v-else :size="20" />
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
          <span class="album-detail__song-order">{{ songOrder + 1 }}</span>
          <div class="album-detail__song-copy">
            <strong class="truncate--block">{{ track.title }}</strong>
            <span class="truncate--block">{{ track.artist || "未知歌手" }}</span>
          </div>
        </div>
        <div class="album-detail__song-actions">
          <span class="album-detail__song-duration">{{
            formatTime(track.duration)
          }}</span>
          <button
            class="icon-btn track-row-more"
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
