<script setup lang="ts">
import {
  ArrowLeft,
  Heart,
  List,
  MoreVertical,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "@lucide/vue";
import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  computed,
  useTemplateRef,
} from "vue";
import { formatTime } from "../utils/media";
import { usePlayerStore, useFavoriteStore, useUIStore } from "../stores";
import TipContent from "../components/TipContent.vue";
import QueuePopover from "./QueuePopover.vue";
import ContextMenu from "./ContextMenu.vue";
import { useTrackContextMenu } from "../composables/useTrackContextMenu";
import "@/styles/popover.css";

const LIST_EL_ID = crypto.randomUUID();
const VOLUME_POPOVER_ID = crypto.randomUUID();

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const uiStore = useUIStore();

const isCurrentTrackLiked = computed(() =>
  playerStore.currentTrack
    ? favoriteStore.likedTrackIdSet.has(playerStore.currentTrackId)
    : false,
);

const lyricsScrollRef = useTemplateRef("lyricsScrollRef");
const detailBodyRef = useTemplateRef("detailBodyRef");
const { menuProps, handleClickTrigger } = useTrackContextMenu();

function handleMoreClick(event: MouseEvent) {
  const track = playerStore.currentTrack;
  if (!track) return;
  handleClickTrigger(track);
}

// 小屏下 .detail-body 可横向滚动，当滚动到歌词页时封面不可见
// 此时返回应移除 view-transition-name，避免动画异常
const isCoverVisible = ref(true);

let scrollRafId = 0;
function handleDetailBodyScroll() {
  cancelAnimationFrame(scrollRafId);
  scrollRafId = requestAnimationFrame(() => {
    const el = detailBodyRef.value;
    if (!el) return;
    // 滚动超过容器宽度的 40% 即认为封面不可见
    isCoverVisible.value = el.scrollLeft < el.clientWidth * 0.4;
  });
}

// 背景交叉淡入淡出：预加载完成后更新 key，触发 Transition
const displayCoverUrl = ref<string | undefined>(undefined);

let disableFollowTimeout: ReturnType<typeof setTimeout> | null = null;
let followThrottleTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingCoverImg: HTMLImageElement | null = null;

onBeforeUnmount(() => {
  if (disableFollowTimeout) clearTimeout(disableFollowTimeout);
  if (followThrottleTimeout) clearTimeout(followThrottleTimeout);
  if (pendingCoverImg) {
    pendingCoverImg.onload = pendingCoverImg.onerror = null;
    pendingCoverImg = null;
  }
});

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
  if (index < 0 || disableFollowTimeout || followThrottleTimeout) {
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
  container.scrollTo({
    top:
      activeLine.offsetTop -
      container.clientHeight / 2 +
      activeLine.offsetHeight / 2,
  });

  followThrottleTimeout = setTimeout(() => {
    followThrottleTimeout = null;
  }, 150);
}
watch(
  () => playerStore.currentTrack?.coverUrl,
  (url) => {
    if (!url) {
      displayCoverUrl.value = "";
      return;
    }
    const img = new Image();
    pendingCoverImg = img;
    img.onload = img.onerror = () => {
      // 竞态
      if (playerStore.currentTrack?.coverUrl !== url) return;
      displayCoverUrl.value = url;
      pendingCoverImg = null;
    };
    img.src = url;
  },
  { immediate: true },
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
    <Transition name="backdrop-fade">
      <div
        class="detail-backdrop"
        :key="displayCoverUrl"
        :style="
          displayCoverUrl
            ? { backgroundImage: `url(${displayCoverUrl})` }
            : undefined
        "
      ></div>
    </Transition>

    <header class="detail-head">
      <button
        class="icon-button"
        type="button"
        aria-label="返回列表"
        title="返回列表"
        @click="uiStore.closeDetail()"
      >
        <ArrowLeft :size="20" />
      </button>
    </header>

    <div
      ref="detailBodyRef"
      class="detail-body"
      @scroll="handleDetailBodyScroll"
    >
      <div class="detail-meta">
        <div class="cover-art detail-cover">
          <img
            v-if="playerStore.currentTrack?.coverUrl"
            :src="playerStore.currentTrack.coverUrl"
            alt="歌曲封面"
            :style="
              playerStore.currentTrack &&
              uiStore.currentView === 'detail' &&
              isCoverVisible
                ? { 'view-transition-name': 'active-cover-art' }
                : undefined
            "
          />
          <span v-else>LM</span>
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
          <div class="detail-progress">
            <span>{{ formatTime(playerStore.currentTimeSeconds) }}</span>
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
            <span>{{
              formatTime(playerStore.currentTrack?.duration || 0)
            }}</span>
          </div>

          <div class="detail-transport">
            <div class="detail-playback">
              <button
                class="icon-button"
                type="button"
                aria-label="上一首"
                title="上一首"
                @click="playerStore.playByStep(-1)"
              >
                <SkipBack :size="26" />
              </button>
              <button
                class="icon-button play-toggle"
                :class="{ 'is-active': playerStore.isPlaying }"
                type="button"
                aria-label="播放或暂停"
                title="播放或暂停"
                @click="playerStore.togglePlay()"
              >
                <Pause v-if="playerStore.isPlaying" :size="30" />
                <Play v-else :size="30" />
              </button>
              <button
                class="icon-button"
                type="button"
                aria-label="下一首"
                title="下一首"
                @click="playerStore.playByStep(1)"
              >
                <SkipForward :size="26" />
              </button>
            </div>
            <div class="detail-actions">
              <button
                class="icon-button is-active"
                type="button"
                :aria-label="playerStore.playbackModeLabel"
                :title="playerStore.playbackModeLabel"
                @click="playerStore.nextPlaybackMode()"
              >
                <Shuffle
                                  v-if="playerStore.playbackMode === 'shuffle'"
                                  :size="20"
                                />
                                <Repeat1
                                  v-else-if="playerStore.playbackMode === 'one'"
                                  :size="20"
                                />
                                <Repeat v-else :size="20" />
              </button>
              <button
                class="icon-button favorite-button"
                :class="{ 'is-active': isCurrentTrackLiked }"
                type="button"
                :aria-label="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
                :title="isCurrentTrackLiked ? '取消喜欢' : '标记喜欢'"
                @click="
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
                :popovertarget="LIST_EL_ID"
              >
                <List :size="20" />
              </button>
              <button
                class="icon-button volume-button"
                type="button"
                :aria-label="
                  playerStore.volumePercent === 0 ? '取消静音' : '音量'
                "
                :title="playerStore.volumePercent === 0 ? '取消静音' : '音量'"
                :popovertarget="VOLUME_POPOVER_ID"
              >
                <VolumeX v-if="playerStore.volumePercent === 0" :size="20" />
                                <Volume2 v-else :size="20" />
              </button>
              <button
                class="icon-button more-button"
                type="button"
                aria-label="更多操作"
                aria-haspopup="menu"
                title="更多操作"
                @click="handleMoreClick($event)"
              >
                <MoreVertical :size="20" />
                              </button>
                            </div>
          </div>
        </div>
      </div>

      <div class="detail-lyrics">
        <div
          ref="lyricsScrollRef"
          class="lyrics-scroll"
          aria-label="歌词"
          :class="{
            'not-overflowed': playerStore.currentLyricsLines.length < 5,
          }"
          @wheel="handleLyricsWheel"
        >
          <div class="lyrics-list" role="list">
            <template v-if="playerStore.currentLyricsLines.length">
              <div
                v-for="(line, index) in playerStore.currentLyricsLines"
                :key="`${index}-${line.time ?? 'plain'}`"
                class="lyrics-line"
                :class="{
                  'is-active': index === playerStore.activeLyricsIndex,
                  'is-clickable': line.time !== null,
                }"
                :tabindex="line.time !== null ? 0 : undefined"
                :role="line.time !== null ? 'button' : 'listitem'"
                :aria-label="displayLyricsText(line.text)"
                :aria-current="index === playerStore.activeLyricsIndex ? 'true' : undefined"
                :data-line-index="index"
                @click="
                  line.time !== null && playerStore.seekToLyricsLine(index)
                "
                @keydown.enter="
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

    <QueuePopover
      :id="LIST_EL_ID"
      popover="auto"
      :tracks="playerStore.queue"
      :current-track-id="playerStore.currentTrackId"
      @play="playerStore.playTrack($event, true)"
      @remove="playerStore.removeFromQueue($event)"
    />
    <div class="detail-volume-popover" popover="auto" :id="VOLUME_POPOVER_ID">
      <input
        class="detail-volume-slider"
        type="range"
        min="0"
        max="100"
        aria-label="音量"
        :value="playerStore.volumePercent"
        :style="{ '--slider-value': playerStore.volumePercent + '%' }"
        @input="
          playerStore.setVolume(
            Number(($event.target as HTMLInputElement).value),
          )
        "
      />
    </div>
    <ContextMenu ref="contextMenu" v-bind="menuProps" />
  </section>
</template>
