<script setup lang="ts">
import {
  Heart,
  List,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "@lucide/vue";
import { computed, useTemplateRef } from "vue";
import type { ComponentExposed } from "vue-component-type-helpers";

import { usePlayerStore } from "../stores/playerStore";
import { useFavoriteStore } from "../stores/favoriteStore";
import { useUIStore } from "../stores/uiStore";
import PlayQueueSheet from "./PlayQueueSheet.vue";
import { ensureCoverUrl } from "../utils/coverCache";

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const uiStore = useUIStore();

const isCurrentTrackLiked = computed(() =>
  playerStore.currentTrack
    ? favoriteStore.likedTrackIdSet.has(playerStore.currentTrackId)
    : false,
);
const enableCoverTransition = computed(() => !uiStore.nowPlayingOpen);
const queueRef =
  useTemplateRef<ComponentExposed<typeof PlayQueueSheet>>("queueRef");

function handlePlayTrack(index: number) {
  playerStore.playTrack(index, true);
}

function handleRemoveTrack(id: string) {
  playerStore.removeFromQueue(id);
}
function handleQueueClick() {
  if (!queueRef.value?.getWasOpen()) {
    queueRef.value?.open();
  }
}
</script>

<template>
  <footer
    class="player-dock"
    aria-label="播放控制栏"
    :style="
      playerStore.currentTrack && enableCoverTransition
        ? { 'view-transition-name': 'dock-detail' }
        : undefined
    "
  >
    <button
      class="player-dock__track player-dock__now-playing-trigger"
      type="button"
      title="查看播放详情"
      @click="playerStore.currentTrack && uiStore.openNowPlaying()"
    >
      <div class="cover-art player-dock__cover">
        <img
          v-if="playerStore.currentTrack?.coverBlob"
          :src="ensureCoverUrl(playerStore.currentTrack!.id, playerStore.currentTrack!.coverBlob)"
          alt="底部播放器封面"
        />
        <span v-else aria-hidden="true">LM</span>
      </div>

      <div class="player-dock__copy">
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

    <div class="player-dock__center">
      <button
        class="icon-button player-dock__playback-mode player-dock__playback-mode--active"
        type="button"
        :aria-label="playerStore.playbackModeLabel"
        :title="playerStore.playbackModeLabel"
        @click.stop="playerStore.nextPlaybackMode()"
      >
        <Shuffle v-if="playerStore.playbackMode === 'shuffle'" :size="20" />
        <Repeat1 v-else-if="playerStore.playbackMode === 'one'" :size="20" />
        <Repeat v-else :size="20" />
      </button>
      <button
        class="icon-button"
        type="button"
        aria-label="上一首"
        title="上一首"
        @click.stop="playerStore.playByStep(-1)"
      >
        <SkipBack :size="20" />
      </button>
      <button
        class="icon-button play-toggle"
        :class="{ 'play-toggle--active': playerStore.isPlaying }"
        type="button"
        aria-label="播放或暂停"
        title="播放或暂停"
        @click.stop="playerStore.togglePlay()"
      >
        <Pause v-if="playerStore.isPlaying" :size="22" />
        <Play v-else :size="22" />
      </button>
      <button
        class="icon-button"
        type="button"
        aria-label="下一首"
        title="下一首"
        @click.stop="playerStore.playByStep(1)"
      >
        <SkipForward :size="20" />
      </button>
      <button
        class="icon-button favorite-button"
        :class="{ 'favorite-button--active': isCurrentTrackLiked }"
        type="button"
        :aria-label="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
        :title="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
        @click.stop="
          favoriteStore.toggleTrackFavorite(playerStore.currentTrackId)
        "
      >
        <Heart
          :size="20"
          :fill="isCurrentTrackLiked ? 'currentColor' : 'none'"
        />
      </button>
      <button
        class="icon-button player-dock__queue-button"
        type="button"
        aria-label="播放队列"
        title="播放队列"
        @click="handleQueueClick"
      >
        <List :size="20" />
      </button>
    </div>

    <div class="player-dock__extra">
        <input
          v-if="playerStore.currentTrack"
          class="player-dock__progress-slider"
          type="range"
          min="0"
          max="100"
          aria-label="播放进度"
          :value="playerStore.progressPercent"
          :style="{ '--slider-value': playerStore.progressPercent + '%' }"
          @input="
            playerStore.seekToPercent(
              Number(($event.target as HTMLInputElement).value),
            )
          "
        />
    </div>
    <PlayQueueSheet
      ref="queueRef"
      :tracks="playerStore.queue"
      :current-track-id="playerStore.currentTrackId"
      @play="handlePlayTrack"
      @remove="handleRemoveTrack"
    />
  </footer>
</template>
