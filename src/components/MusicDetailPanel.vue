<script setup lang="ts">
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-vue-next";
import { nextTick, ref, watch, computed } from "vue";
import { sliderStyle } from "../utils/media";
import { usePlayerStore, useFavoriteStore, useUIStore } from "../stores";
import { Volume2 } from "lucide-vue-next"; // used in volume control
import TipContent from "../components/TipContent.vue";

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const uiStore = useUIStore();

const isCurrentTrackLiked = computed(() =>
  playerStore.currentTrack
    ? favoriteStore.likedTrackIdSet.has(playerStore.currentTrackId)
    : false,
);

const lyricsScrollRef = ref<HTMLElement | null>(null);

// 双图层交叉淡入淡出背景
const backdropA = ref<string | undefined>(undefined);
const backdropB = ref<string | undefined>(undefined);
const activeLayer = ref<"A" | "B">("A");

function preloadAndSwitchLayer(url: string | undefined) {
  if (!url) return;
  // 重复状态
  if (
    (activeLayer.value === "A" && url === backdropA.value) ||
    (activeLayer.value === "B" && url === backdropB.value)
  )
    return;
  const img = new Image();
  img.onload = img.onerror = () => {
    // 竞态条件
    if (playerStore.currentTrack.coverUrl !== url) return;
    // 加载失败也切换，避免卡住
    if (activeLayer.value === "A") {
      backdropB.value = url;
      activeLayer.value = "B";
    } else {
      backdropA.value = url;
      activeLayer.value = "A";
    }
  };
  img.src = url;
}

let disableFollowTimeout: ReturnType<typeof setTimeout> | null = null;

function handleLyricsWheel(event: Event) {
  if (disableFollowTimeout) {
    clearTimeout(disableFollowTimeout);
  }
  disableFollowTimeout = setTimeout(() => {
    disableFollowTimeout = null;
  }, 3000);
}

function displayLyricsText(text: string) {
  return text.replace(/^(\[[^\]]+\]\s*)+/, "").trim() || text.trim();
}

function scheduleLyricsFollow(index: number) {
  if (index < 0 || disableFollowTimeout) {
    return;
  }

  const container = lyricsScrollRef.value;
  if (!container || container.clientHeight === 0) {
    return;
  }

  const activeLine = container.querySelector<HTMLElement>(
    `[data-line-index="${index}"]`,
  );
  if (!activeLine) {
    return;
  }

  // 将当前歌词行滚动到容器可视区域的垂直居中位置
  const targetTop =
    activeLine.offsetTop -
    container.clientHeight / 2 +
    activeLine.offsetHeight / 2;
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  container.scrollTo({
    top: Math.min(Math.max(targetTop, 0), maxScrollTop),
    behavior: "smooth",
  });
}
watch(
  [() => playerStore.currentTrack?.coverUrl, () => uiStore.currentView],
  ([url, view]) => {
    if (view !== "detail") return;
    preloadAndSwitchLayer(url);
  },
);
watch(
  [
    () => playerStore.activeLyricsIndex,
    () => uiStore.currentView,
    () => playerStore.currentLyricsLines.length,
  ],
  ([index, view]) => {
    if (view !== "detail") return;
    // 延迟一帧，等待 v-show 切换后浏览器完成布局计算
    // 否则容器 clientHeight 仍为 0，歌词无法滚动到正确位置
    nextTick(() => {
      scheduleLyricsFollow(index);
    });
  },
  { immediate: true },
);

watch(
  () => playerStore.currentTrack?.id,
  () => {
    nextTick(() => {
      lyricsScrollRef.value?.scrollTo({ top: 0, behavior: "auto" });
    });
  },
);
</script>

<template>
  <section class="detail-page">
    <div
      class="detail-backdrop"
      :class="{ 'is-active': activeLayer === 'A' }"
      :style="backdropA ? { backgroundImage: `url(${backdropA})` } : undefined"
    ></div>
    <div
      class="detail-backdrop"
      :class="{ 'is-active': activeLayer === 'B' }"
      :style="backdropB ? { backgroundImage: `url(${backdropB})` } : undefined"
    ></div>

    <header class="detail-head">
      <button
        class="icon-button"
        type="button"
        aria-label="返回列表"
        @click="uiStore.closeDetail()"
      >
        <ArrowLeft :size="18" />
      </button>
    </header>

    <div class="detail-body">
      <div class="detail-meta">
        <div class="cover-art detail-cover">
          <img
            v-if="playerStore.currentTrack?.coverUrl"
            :src="playerStore.currentTrack.coverUrl"
            alt="歌曲封面"
            :style="
              playerStore.currentTrack && uiStore.currentView === 'detail'
                ? { 'view-transition-name': 'active-cover-art' }
                : undefined
            "
          />
          <span v-else>CB</span>
        </div>

        <div class="detail-copy">
          <h3>{{ playerStore.currentTrack?.title || "请选择一首歌曲" }}</h3>
          <p>
            {{
              playerStore.currentTrack
                ? `${playerStore.currentTrack.artist} · ${playerStore.currentTrack.album}`
                : "点击歌曲后播放"
            }}
          </p>
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
              :value="playerStore.volumePercent"
              :style="sliderStyle(playerStore.volumePercent)"
              @input="
                playerStore.setVolume(
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
            <span class="detail-volume-end" aria-hidden="true"></span>
          </label>

          <div class="detail-progress">
            <span>{{ playerStore.currentTimeLabel }}</span>
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
            <span>{{ playerStore.totalTimeLabel }}</span>
          </div>

          <div class="detail-transport">
            <button
              class="icon-button is-active"
              type="button"
              :aria-label="playerStore.playbackModeLabel"
              :title="playerStore.playbackModeLabel"
              @click="playerStore.nextPlaybackMode()"
            >
              <Shuffle
                v-if="playerStore.playbackMode === 'shuffle'"
                :size="18"
              />
              <Repeat1
                v-else-if="playerStore.playbackMode === 'one'"
                :size="18"
              />
              <Repeat v-else :size="18" />
            </button>
            <button
              class="icon-button"
              type="button"
              aria-label="上一首"
              @click="playerStore.playByStep(-1)"
            >
              <ChevronLeft :size="20" />
            </button>
            <button
              class="icon-button play-toggle"
              :class="{ 'is-active': playerStore.isPlaying }"
              type="button"
              aria-label="播放或暂停"
              @click="playerStore.togglePlay()"
            >
              <Pause v-if="playerStore.isPlaying" :size="24" />
              <Play v-else :size="24" />
            </button>
            <button
              class="icon-button"
              type="button"
              aria-label="下一首"
              @click="playerStore.playByStep(1)"
            >
              <ChevronRight :size="20" />
            </button>
            <button
              class="icon-button favorite-button"
              :class="{ 'is-active': isCurrentTrackLiked }"
              type="button"
              :aria-label="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
              @click="
                favoriteStore.toggleTrackFavorite(playerStore.currentTrackId)
              "
            >
              <Heart
                :size="18"
                :fill="isCurrentTrackLiked ? 'currentColor' : 'none'"
              />
            </button>
          </div>
        </div>
      </div>

      <div class="detail-lyrics">
        <div
          ref="lyricsScrollRef"
          class="lyrics-scroll"
          :class="{
            'not-overflowed': playerStore.currentLyricsLines.length < 5,
          }"
          @wheel="handleLyricsWheel"
        >
          <div class="lyrics-list">
            <template v-if="playerStore.currentLyricsLines.length">
              <div
                v-for="(line, index) in playerStore.currentLyricsLines"
                :key="`${index}-${line.time ?? 'plain'}-${line.text}`"
                class="lyrics-line"
                :class="{
                  'is-active': index === playerStore.activeLyricsIndex,
                  'is-clickable': line.time !== null,
                }"
                :data-line-index="index"
                @click="
                  line.time !== null && playerStore.seekToLyricsLine(index)
                "
              >
                <span>{{ displayLyricsText(line.text) }}</span>
              </div>
            </template>
            <TipContent
              v-else
              title="这首歌还没有可展示的歌词"
              content="优先读取同目录 `.lrc`，其次读取音频标签里的内嵌歌词。"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
