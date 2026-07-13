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

import { usePlayerStore } from "../stores/playerStore";
import { useFavoriteStore } from "../stores/favoriteStore";
import { useUIStore } from "../stores/uiStore";
import QueuePopover from "./QueuePopover.vue";

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const uiStore = useUIStore();

const isCurrentTrackLiked = computed(() =>
  playerStore.currentTrack
    ? favoriteStore.likedTrackIdSet.has(playerStore.currentTrackId)
    : false,
);
const enableCoverTransition = computed(() => uiStore.currentView !== "detail");
const queueRef = useTemplateRef<InstanceType<typeof QueuePopover>>("queueRef");

function handlePlayTrack(index: number) {
  playerStore.playTrack(index, true);
}

function handleRemoveTrack(id: string) {
  playerStore.removeFromQueue(id);
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
      class="dock-track detail-trigger"
      type="button"
      title="查看播放详情"
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
        class="icon-button playback-mode-button is-active"
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
        :class="{ 'is-active': playerStore.isPlaying }"
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
        :class="{ 'is-active': isCurrentTrackLiked }"
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
        class="icon-button queue-button"
        type="button"
        aria-label="播放队列"
        title="播放队列"
        @click="queueRef?.open()"
      >
        <List :size="20" />
      </button>
    </div>

    <div class="dock-extra">
      <div class="progress-row" v-if="playerStore.currentTrack">
        <input
          class="progress-slider"
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
    </div>

    <QueuePopover
      ref="queueRef"
      :tracks="playerStore.queue"
      :current-track-id="playerStore.currentTrackId"
      @play="handlePlayTrack"
      @remove="handleRemoveTrack"
    />
  </footer>
</template>
