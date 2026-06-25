<script setup lang="ts">
import { ArrowLeft, Disc3, Pause, Play } from "lucide-vue-next";
import { formatTime } from "../utils/media";
import { Album } from "@/types";
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
</script>

<template>
  <section class="album-detail-view">
    <template v-if="album">
      <div class="album-detail-content">
        <div class="album-detail-head">
          <button class="back-button" type="button" @click="emit('back')">
            <ArrowLeft :size="18" />
          </button>
          <div class="album-detail-cover">
            <img
              v-if="album.coverUrl"
              :src="album.coverUrl"
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
            <Play :size="16" />
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
                  :size="16"
                />
                <Play v-else :size="16" />
              </div>
              <div class="album-song-copy">
                <strong>{{ songOrder + 1 }}. {{ track.title }}</strong>
                <span>{{ track.artist || "未知歌手" }}</span>
              </div>
            </div>
            <span class="album-song-duration">{{
              formatTime(track.duration)
            }}</span>
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
