<script setup lang="ts">
import type { Track } from "../types";

const props = defineProps<{
  currentTrack: Track | null;
  folderName: string;
  loading: boolean;
  loadingDone: number;
  loadingTotal: number;
  isPlaying: boolean;
  isShuffle: boolean;
  trackCount: number;
  visibleCount: number;
  heroStatus: string;
}>();

defineEmits<{
  togglePlay: [];
  toggleShuffle: [];
}>();
</script>

<template>
  <section class="hero-card">
    <div class="cover-art hero-cover">
      <img v-if="props.currentTrack?.coverUrl" :src="props.currentTrack.coverUrl" alt="当前歌曲封面" />
      <span v-else aria-hidden="true">LOUD</span>
    </div>

    <div class="hero-copy">
      <p class="eyebrow">正在播放</p>
      <h2>{{ props.currentTrack?.title || (props.loading ? "正在导入本地音乐..." : "从本地文件夹开始") }}</h2>
      <p class="hero-artist">
        {{
          props.currentTrack
            ? `${props.currentTrack.artist} · ${props.currentTrack.relativePath}`
            : props.loading
              ? `正在准备 ${props.loadingDone} / ${props.loadingTotal} 首歌曲`
              : "选择一个本地音乐目录，播放器会自动生成歌单并解析常见 MP3 标签。"
        }}
      </p>

      <div class="hero-meta">
        <span>{{ props.currentTrack?.album || props.folderName || "本地音乐会客厅" }}</span>
        <span>{{ props.currentTrack ? Math.floor(props.currentTrack.duration / 60).toString().padStart(2, '0') + ':' + Math.floor(props.currentTrack.duration % 60).toString().padStart(2, '0') : '--:--' }}</span>
        <span>{{ props.currentTrack?.format || (props.loading ? "导入中" : "未载入") }}</span>
      </div>

      <div class="hero-actions">
        <button class="play-button" type="button" @click="$emit('togglePlay')">
          {{ props.isPlaying ? "暂停" : "播放" }}
        </button>
        <button
          class="secondary-button"
          :class="{ 'is-active': props.isShuffle }"
          type="button"
          @click="$emit('toggleShuffle')"
        >
          随机播放
        </button>
      </div>
    </div>

    <div class="hero-summary">
      <div class="summary-card">
        <span>曲目数量</span>
        <strong>{{ props.trackCount }}</strong>
      </div>
      <div class="summary-card">
        <span>当前视图</span>
        <strong>{{ props.visibleCount }}</strong>
      </div>
      <div class="summary-card">
        <span>导入状态</span>
        <strong>{{ props.heroStatus }}</strong>
      </div>
    </div>
  </section>
</template>
