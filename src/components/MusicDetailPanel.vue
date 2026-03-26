<script setup lang="ts">
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Pause, Play, Repeat, Repeat1, Shuffle, Volume2 } from "lucide-vue-next";
import { nextTick, onMounted, ref, watch } from "vue";
import type { LyricsLine, Track } from "../types";
import { sliderStyle } from "../utils/media";

const props = defineProps<{
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTimeLabel: string;
  totalTimeLabel: string;
  progressPercent: number;
  volumePercent: number;
  playbackMode: "off" | "one" | "shuffle";
  playbackModeLabel: string;
  isCurrentTrackLiked: boolean;
  lyricsLines: LyricsLine[];
  activeLyricsIndex: number;
  hasTimedLyrics: boolean;
}>();

const emit = defineEmits<{
  close: [];
  prev: [];
  next: [];
  togglePlay: [];
  cyclePlaybackMode: [];
  seek: [value: number];
  setVolume: [value: number];
  toggleFavorite: [];
  seekLine: [index: number];
}>();

const lyricsScrollRef = ref<HTMLElement | null>(null);

function displayLyricsText(text: string) {
  return text.replace(/^(\[[^\]]+\]\s*)+/, "").trim() || text.trim();
}

function getOffsetWithinContainer(element: HTMLElement, container: HTMLElement) {
  let offset = 0;
  let current: HTMLElement | null = element;

  while (current && current !== container) {
    offset += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }

  return offset;
}

function getLyricsStep(container: HTMLElement, index: number) {
  const currentLine = container.querySelector<HTMLElement>(`[data-line-index="${index}"]`);
  const prevLine = index > 0 ? container.querySelector<HTMLElement>(`[data-line-index="${index - 1}"]`) : null;
  const nextLine = container.querySelector<HTMLElement>(`[data-line-index="${index + 1}"]`);

  if (currentLine && prevLine) {
    const step = getOffsetWithinContainer(currentLine, container) - getOffsetWithinContainer(prevLine, container);
    if (step > 0) {
      return step;
    }
  }

  if (currentLine && nextLine) {
    const step = getOffsetWithinContainer(nextLine, container) - getOffsetWithinContainer(currentLine, container);
    if (step > 0) {
      return step;
    }
  }

  return currentLine?.offsetHeight || 0;
}

function scheduleLyricsFollow(index: number) {
  if (index < 0) {
    return;
  }

  void nextTick(() => {
    const container = lyricsScrollRef.value;
    if (!container) {
      return;
    }

    const activeLine = container.querySelector<HTMLElement>(`[data-line-index="${index}"]`);
    if (!activeLine) {
      return;
    }

    const targetTop =
      getOffsetWithinContainer(activeLine, container) - container.clientHeight / 2 + activeLine.offsetHeight / 2;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const step = getLyricsStep(container, index);
    const snappedTop = step > 0 ? Math.round(targetTop / step) * step : targetTop;
    container.scrollTo({
      top: Math.min(Math.max(snappedTop, 0), maxScrollTop),
      behavior: "smooth",
    });
  });
}

function blockLyricsManualScroll(event: Event) {
  event.preventDefault();
}

watch(
  () => props.activeLyricsIndex,
  (index) => {
    scheduleLyricsFollow(index);
  },
  { flush: "post", immediate: true },
);

watch(
  () => props.currentTrack?.id,
  () => {
    void nextTick(() => {
      lyricsScrollRef.value?.scrollTo({ top: 0, behavior: "auto" });
    });
  },
  { flush: "post" },
);

watch(
  () => props.lyricsLines.length,
  () => {
    scheduleLyricsFollow(props.activeLyricsIndex);
  },
  { flush: "post" },
);

onMounted(() => {
  scheduleLyricsFollow(props.activeLyricsIndex);
});
</script>

<template>
  <section class="detail-page">
    <div class="detail-backdrop" :style="currentTrack?.coverUrl ? { backgroundImage: `url(${currentTrack.coverUrl})` } : undefined"></div>

    <header class="detail-head">
      <button class="icon-button" type="button" aria-label="返回列表" @click="emit('close')">
        <ArrowLeft :size="18" />
      </button>
    </header>

    <div class="detail-body">
      <div class="detail-meta">
        <div class="cover-art detail-cover">
          <img v-if="currentTrack?.coverUrl" :src="currentTrack.coverUrl" alt="歌曲封面" />
          <span v-else>CB</span>
        </div>

        <div class="detail-copy">
          <h3>{{ currentTrack?.title || "请选择一首歌曲" }}</h3>
          <p>{{ currentTrack ? `${currentTrack.artist} · ${currentTrack.album}` : "点击歌曲后播放" }}</p>
        </div>

        <div class="detail-controls">
          <label class="volume-wrap detail-volume">
            <span class="volume-label">
              <Volume2 :size="16" />
            </span>
            <input
              class="volume-slider detail-volume-slider"
              type="range"
              min="0"
              max="100"
              :value="volumePercent"
              :style="sliderStyle(volumePercent)"
              @input="emit('setVolume', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="detail-volume-end" aria-hidden="true"></span>
          </label>

          <div class="detail-progress">
            <span>{{ currentTimeLabel }}</span>
            <input
              class="progress-slider"
              type="range"
              min="0"
              max="100"
              :value="progressPercent"
              :style="sliderStyle(progressPercent)"
              @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
            />
            <span>{{ totalTimeLabel }}</span>
          </div>

          <div class="detail-transport">
            <button class="mode-button mode-button--icon is-active" type="button" :aria-label="playbackModeLabel" :title="playbackModeLabel" @click="emit('cyclePlaybackMode')">
              <Shuffle v-if="playbackMode === 'shuffle'" :size="18" />
              <Repeat1 v-else-if="playbackMode === 'one'" :size="18" />
              <Repeat v-else :size="18" />
            </button>
            <button class="icon-button detail-control-button" type="button" aria-label="上一首" @click="emit('prev')">
              <ChevronLeft :size="20" />
            </button>
            <button class="play-toggle detail-main-toggle" type="button" aria-label="播放或暂停" @click="emit('togglePlay')">
              <Pause v-if="isPlaying" :size="24" />
              <Play v-else :size="24" />
            </button>
            <button class="icon-button detail-control-button" type="button" aria-label="下一首" @click="emit('next')">
              <ChevronRight :size="20" />
            </button>
            <button
              class="mode-button mode-button--icon favorite-button"
              :class="{ 'is-active': isCurrentTrackLiked }"
              type="button"
              :aria-label="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
              @click="emit('toggleFavorite')"
            >
              <Heart :size="18" :fill="isCurrentTrackLiked ? 'currentColor' : 'none'" />
            </button>
          </div>
        </div>
      </div>

      <div class="detail-lyrics">
        <div
          ref="lyricsScrollRef"
          class="lyrics-scroll"
          @wheel.prevent="blockLyricsManualScroll"
          @touchmove.prevent="blockLyricsManualScroll"
        >
          <div class="lyrics-list">
            <template v-if="lyricsLines.length">
              <div
                v-for="(line, index) in lyricsLines"
                :key="`${index}-${line.time ?? 'plain'}-${line.text}`"
                class="lyrics-line"
                :class="{ 'is-active': index === activeLyricsIndex, 'is-clickable': line.time !== null }"
                :data-line-index="index"
                @click="line.time !== null && emit('seekLine', index)"
              >
                <span>{{ displayLyricsText(line.text) }}</span>
              </div>
            </template>
            <div v-else class="empty-panel detail-empty">
              <strong>这首歌还没有可展示的歌词</strong>
              <p>优先读取同目录 `.lrc`，其次读取音频标签里的内嵌歌词。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
