<script setup lang="ts">
import { ArrowLeft, Disc3, MoreVertical, Pause, Play } from "@lucide/vue";
import { ref } from "vue";
import { formatTime } from "../utils/media";
import { Album } from "@/types";
import ContextMenu from "./ContextMenu.vue";
import ActionSheet from "./ActionSheet.vue";
import { useTrackContextMenu } from "../composables/useTrackContextMenu";

interface Props {
  album: Album;
  playingTrackId: string;
  viewTransitionName?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "stop", trackId: string): void;
  (e: "playAlbum", albumName: string): void;
  (e: "playTrack", albumName: string, trackId: string): void;
}>();

const { menuProps, open: openContextMenu, isSmallScreen } = useTrackContextMenu();
const contextMenuHeader = ref("");

function handleContextMenu(
  event: MouseEvent,
  track: (typeof props.album.tracks)[number],
) {
  event.preventDefault();
  event.stopPropagation();
  contextMenuHeader.value = track.title;
  openContextMenu(track, event);
}
</script>

<template>
  <section class="album-detail-view">
    <div class="album-detail-head">
      <button
        class="icon-button back-button"
        type="button"
        @click="emit('back')"
      >
        <ArrowLeft :size="20" />
      </button>
      <div class="album-detail-cover">
        <img
          v-if="album.coverUrl"
          :src="album.coverUrl"
          class="img-fadein is-loaded"
          :alt="`${album.name} 封面`"
          :style="{ 'view-transition-name': viewTransitionName }"
        />
        <Disc3 v-else :size="34" />
      </div>
      <div class="album-detail-copy">
        <h3>{{ album.name }}</h3>
        <span>{{ album.artistLabel }}</span>
        <div class="album-detail-stats">
          <span>{{ album.tracks.length }} 首</span>
          <span>{{ formatTime(album.duration) }}</span>
        </div>
      </div>
      <button
        class="primary-button album-play-button"
        type="button"
        @click="emit('playAlbum', album.name)"
      >
        <Play :size="20" />
        <span>播放专辑</span>
      </button>
    </div>

    <div class="album-song-list">
      <button
        v-for="(track, songOrder) in album.tracks"
        :key="track.id"
        class="album-song-row"
        :class="{ 'is-active': track.id === playingTrackId }"
        type="button"
        @click="emit('playTrack', album.name, track.id)"
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
              @click.stop="emit('stop', track.id)"
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
            class="row-more"
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
