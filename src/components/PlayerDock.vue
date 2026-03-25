<script setup lang="ts">
import { ChevronLeft, ChevronRight, Heart, Pause, Play, Repeat, Repeat1, Shuffle, Volume2 } from "lucide-vue-next";
import type { Track } from "../types";
import { sliderStyle } from "../utils/media";

defineProps<{
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTimeLabel: string;
  totalTimeLabel: string;
  progressPercent: number;
  volumePercent: number;
  playbackMode: "off" | "one" | "shuffle";
  playbackModeLabel: string;
  isCurrentTrackLiked: boolean;
}>();

defineEmits<{
  openDetail: [];
  prev: [];
  next: [];
  togglePlay: [];
  cyclePlaybackMode: [];
  seek: [value: number];
  setVolume: [value: number];
  toggleFavorite: [];
}>();
</script>

<template>
  <footer class="player-dock">
    <button class="dock-track detail-trigger" type="button" @click="$emit('openDetail')">
      <div class="cover-art dock-cover">
        <img v-if="currentTrack?.coverUrl" :src="currentTrack.coverUrl" alt="底部播放器封面" />
        <span v-else aria-hidden="true">LM</span>
      </div>

      <div class="dock-copy">
        <strong>{{ currentTrack?.title || '还没有播放歌曲' }}</strong>
        <span>{{ currentTrack ? `${currentTrack.artist} · ${currentTrack.album}` : '导入本地音乐后即可播放' }}</span>
      </div>
    </button>

    <div class="dock-center">
      <div class="transport">
        <button class="icon-button" type="button" aria-label="上一首" @click.stop="$emit('prev')">
          <ChevronLeft :size="20" />
        </button>
        <button class="play-toggle" type="button" aria-label="播放或暂停" @click.stop="$emit('togglePlay')">
          <Pause v-if="isPlaying" :size="22" />
          <Play v-else :size="22" />
        </button>
        <button class="icon-button" type="button" aria-label="下一首" @click.stop="$emit('next')">
          <ChevronRight :size="20" />
        </button>
        <button
          class="mode-button mode-button--icon favorite-button"
          :class="{ 'is-active': isCurrentTrackLiked }"
          type="button"
          :aria-label="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
          @click.stop="$emit('toggleFavorite')"
        >
          <Heart :size="18" :fill="isCurrentTrackLiked ? 'currentColor' : 'none'" />
        </button>
        <button class="mode-button mode-button--icon is-active" type="button" :aria-label="playbackModeLabel" :title="playbackModeLabel" @click.stop="$emit('cyclePlaybackMode')">
          <Shuffle v-if="playbackMode === 'shuffle'" :size="18" />
          <Repeat1 v-else-if="playbackMode === 'one'" :size="18" />
          <Repeat v-else :size="18" />
        </button>
      </div>

      <div class="progress-row">
        <span>{{ currentTimeLabel }}</span>
        <input
          class="progress-slider"
          type="range"
          min="0"
          max="100"
          :value="progressPercent"
          :style="sliderStyle(progressPercent)"
          @input="$emit('seek', Number(($event.target as HTMLInputElement).value))"
        />
        <span>{{ totalTimeLabel }}</span>
      </div>
    </div>

    <div class="dock-extra">
      <label class="volume-wrap">
        <span class="volume-label">
          <Volume2 :size="16" />
        </span>
        <input
          class="volume-slider"
          type="range"
          min="0"
          max="100"
          :value="volumePercent"
          :style="sliderStyle(volumePercent)"
          @input="$emit('setVolume', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>
  </footer>
</template>
