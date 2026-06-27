<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-vue-next";
import { computed } from "vue";
import { sliderStyle } from "../utils/media";
import { usePlayerStore } from "../stores/playerStore";
import { useFavoriteStore } from "../stores/favoriteStore";
import { useUIStore } from "../stores/uiStore";

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const uiStore = useUIStore();

const isCurrentTrackLiked = computed(() =>
  playerStore.currentTrack
    ? favoriteStore.likedTrackIdSet.has(playerStore.currentTrackId)
    : false,
);
const enableCoverTransition = computed(() => uiStore.currentView !== "detail");
</script>

<template>
  <footer class="player-dock">
    <button
      class="dock-track detail-trigger"
      type="button"
      @click="playerStore.currentTrack && uiStore.openDetail()"
    >
      <div class="cover-art dock-cover">
        <img
          v-if="playerStore.currentTrack?.coverUrl"
          :src="playerStore.currentTrack.coverUrl"
          alt="底部播放器封面"
          :style="
            playerStore.currentTrack && enableCoverTransition
              ? { 'view-transition-name': 'active-cover-art' }
              : undefined
          "
        />
        <span v-else aria-hidden="true">LM</span>
      </div>

      <div class="dock-copy">
        <strong>{{
          playerStore.currentTrack?.title || "请选择一首歌曲"
        }}</strong>
        <span>{{
          playerStore.currentTrack
            ? `${playerStore.currentTrack.artist} · ${playerStore.currentTrack.album}`
            : "点击歌曲后播放"
        }}</span>
      </div>
    </button>

    <div class="dock-center">
      <button
        class="mode-button mode-button--icon is-active"
        type="button"
        :aria-label="playerStore.playbackModeLabel"
        :title="playerStore.playbackModeLabel"
        @click.stop="playerStore.nextPlaybackMode()"
      >
        <Shuffle v-if="playerStore.playbackMode === 'shuffle'" :size="18" />
        <Repeat1 v-else-if="playerStore.playbackMode === 'one'" :size="18" />
        <Repeat v-else :size="18" />
      </button>
      <button
        class="icon-button"
        type="button"
        aria-label="上一首"
        @click.stop="playerStore.playByStep(-1)"
      >
        <ChevronLeft :size="20" />
      </button>
      <button
        class="play-toggle"
        :class="{ 'is-active': playerStore.isPlaying }"
        type="button"
        aria-label="播放或暂停"
        @click.stop="playerStore.togglePlay()"
      >
        <Pause v-if="playerStore.isPlaying" :size="22" />
        <Play v-else :size="22" />
      </button>
      <button
        class="icon-button"
        type="button"
        aria-label="下一首"
        @click.stop="playerStore.playByStep(1)"
      >
        <ChevronRight :size="20" />
      </button>
      <button
        class="mode-button mode-button--icon favorite-button"
        :class="{ 'is-active': isCurrentTrackLiked }"
        type="button"
        :aria-label="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
        @click.stop="
          favoriteStore.toggleTrackFavorite(playerStore.currentTrackId)
        "
      >
        <Heart
          :size="18"
          :fill="isCurrentTrackLiked ? 'currentColor' : 'none'"
        />
      </button>
    </div>

    <div class="dock-extra">
      <div class="progress-row" v-if="playerStore.currentTrack">
        <input
          class="progress-slider"
          type="range"
          min="0"
          max="100"
          :value="playerStore.progressPercent"
          :style="sliderStyle(playerStore.progressPercent)"
          @input="
            playerStore.seekToPercent(
              Number(($event.target as HTMLInputElement).value),
            )
          "
        />
      </div>
    </div>
  </footer>
</template>
