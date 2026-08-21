<script setup lang="ts">
import {
  ChevronDown,
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
  onMounted,
} from "vue";
import type { ComponentExposed } from "vue-component-type-helpers";
import { formatTime } from "../utils/media";
import { usePlayerStore, useFavoriteStore, useUIStore } from "../stores";
import BottomSheet from "../components/BottomSheet.vue";
import PlayQueueSheet from "../components/PlayQueueSheet.vue";
import ContextMenu from "../components/ContextMenu.vue";
import ActionSheet from "../components/ActionSheet.vue";
import { useTrackContextMenu } from "../composables/useTrackContextMenu";
import { ensureCoverUrl } from "../utils/coverCache";
import ChangeableImg from "@/components/ChangeableImg.vue";
const VOLUME_POPOVER_ID = crypto.randomUUID();

const playerStore = usePlayerStore();
const favoriteStore = useFavoriteStore();
const uiStore = useUIStore();

const sheetRef =
  useTemplateRef<ComponentExposed<typeof BottomSheet>>("sheetRef");
const queueRef =
  useTemplateRef<ComponentExposed<typeof PlayQueueSheet>>("queueRef");

const isCurrentTrackLiked = computed(() =>
  playerStore.currentTrack
    ? favoriteStore.likedTrackIdSet.has(playerStore.currentTrackId)
    : false,
);

const lyricsScrollRef = useTemplateRef("lyricsScrollRef");
const { menuProps, handleClickTrigger, isSmallScreen } = useTrackContextMenu();

function handleMoreClick(event: MouseEvent) {
  const track = playerStore.currentTrack;
  if (!track) return;
  handleClickTrigger(track);
}

function handleQueueClick() {
  if (!queueRef.value?.getWasOpen()) {
    queueRef.value?.open();
  }
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
  () => playerStore.currentTrack?.id,
  (trackId) => {
    const track = playerStore.currentTrack;
    if (!trackId || !track?.coverBlob) {
      displayCoverUrl.value = "";
      return;
    }
    const url = ensureCoverUrl(trackId, track.coverBlob);
    const img = new Image();
    pendingCoverImg = img;
    img.onload = img.onerror = () => {
      if (playerStore.currentTrack?.id !== trackId) return;
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
    () => uiStore.nowPlayingOpen,
    () => playerStore.currentLyricsLines.length,
  ],
  ([index, open]) => {
    if (!open) return;
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
  <BottomSheet
    v-model="uiStore.nowPlayingOpen"
    ref="sheetRef"
    :snap-points="[1]"
    hide-handle
    body-class="now-playing__sheet-body"
  >
    <section class="now-playing">
      <Transition name="opacity-fade">
        <div
          class="now-playing__backdrop"
          :key="displayCoverUrl"
          :style="
            displayCoverUrl
              ? { '--cover-url': `url(${displayCoverUrl})` }
              : undefined
          "
        ></div>
      </Transition>

      <header class="now-playing__head">
        <button
          class="icon-btn"
          type="button"
          aria-label="返回列表"
          title="返回列表"
          @click="uiStore.closeNowPlaying()"
        >
          <ChevronDown :size="20" />
        </button>
      </header>

      <div class="now-playing__body">
        <div class="now-playing__meta">
          <div class="now-playing__meta-inner">
            <div class="cover-art now-playing__cover">
              <ChangeableImg
                v-if="playerStore.currentTrack?.coverBlob"
                width="100cqmin"
                height="100cqmin"
                :src="
                  ensureCoverUrl(
                    playerStore.currentTrack!.id,
                    playerStore.currentTrack!.coverBlob,
                  )
                "
                alt="歌曲封面"
              />
            </div>

            <div class="now-playing__copy">
              <h3>{{ playerStore.currentTrack?.title || "请选择一首歌曲" }}</h3>
              <p>
                {{
                  playerStore.currentTrack
                    ? `${playerStore.currentTrack.artist} - ${playerStore.currentTrack.album}`
                    : "点击歌曲后播放"
                }}
              </p>
            </div>

            <div class="now-playing__progress">
              <input
                class="player-dock__progress-slider"
                type="range"
                min="0"
                max="100"
                aria-label="播放进度"
                :value="playerStore.progressPercent"
                :style="{ '--slider-value': playerStore.progressPercent + '%' }"
                :step="0.1"
                @input="
                  playerStore.seekToPercent(
                    Number(($event.target as HTMLInputElement).value),
                  )
                "
              />
              <div class="now-playing__progress-times">
                <span>{{ formatTime(playerStore.currentTimeSeconds) }}</span>
                <span>{{
                  formatTime(playerStore.currentTrack?.duration || 0)
                }}</span>
              </div>
            </div>

            <div class="now-playing__playback">
              <button
                class="icon-btn"
                type="button"
                aria-label="上一首"
                title="上一首"
                @click="playerStore.playByStep(-1)"
              >
                <SkipBack :size="26" />
              </button>
              <button
                class="icon-btn play-toggle"
                :class="{ 'play-toggle--active': playerStore.isPlaying }"
                type="button"
                aria-label="播放或暂停"
                title="播放或暂停"
                @click="playerStore.togglePlay()"
              >
                <Pause v-if="playerStore.isPlaying" :size="30" />
                <Play v-else :size="30" />
              </button>
              <button
                class="icon-btn"
                type="button"
                aria-label="下一首"
                title="下一首"
                @click="playerStore.playByStep(1)"
              >
                <SkipForward :size="26" />
              </button>
            </div>

            <div class="now-playing__actions">
              <button
                class="icon-btn now-playing__playback-mode now-playing__playback-mode--active"
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
                class="icon-btn favorite-button"
                :class="{ 'favorite-button--active': isCurrentTrackLiked }"
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
                class="icon-btn now-playing__queue-button"
                type="button"
                aria-label="播放队列"
                title="播放队列"
                @click="handleQueueClick"
              >
                <List :size="20" />
              </button>
              <button
                class="icon-btn player-dock__volume-button"
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
                class="icon-btn now-playing__more-button"
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
        <div class="now-playing__lyrics">
          <div
            ref="lyricsScrollRef"
            class="now-playing__lyrics-scroll"
            aria-label="歌词"
            :class="{
              'now-playing__lyrics-scroll--collapsed':
                playerStore.currentLyricsLines.length < 5,
            }"
            @wheel="handleLyricsWheel"
          >
            <div class="now-playing__lyrics-list" role="list">
              <template v-if="playerStore.currentLyricsLines.length">
                <div
                  v-for="(line, index) in playerStore.currentLyricsLines"
                  :key="`${index}-${line.time ?? 'plain'}`"
                  class="now-playing__lyrics-line"
                  :class="{
                    'now-playing__lyrics-line--active':
                      index === playerStore.activeLyricsIndex,
                    'now-playing__lyrics-line--clickable': line.time !== null,
                  }"
                  :tabindex="line.time !== null ? 0 : undefined"
                  :role="line.time !== null ? 'button' : 'listitem'"
                  :aria-label="line.source"
                  :aria-current="
                    index === playerStore.activeLyricsIndex ? 'true' : undefined
                  "
                  :data-line-index="index"
                  @click="
                    line.time !== null && playerStore.seekToLyricsLine(index)
                  "
                  @keydown.enter="
                    line.time !== null && playerStore.seekToLyricsLine(index)
                  "
                >
                  <span>{{ line.source }}</span>
                  <span
                    class="now-playing__lyrics-translation"
                    v-if="line.translation"
                  >
                    {{ line.translation }}
                  </span>
                </div>
              </template>
              <div
                v-else
                class="now-playing__lyrics-line now-playing__lyrics-line--active"
                tabindex="0"
                role="listitem"
                aria-label="暂无歌词"
              >
                <span>暂无歌词</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PlayQueueSheet
        ref="queueRef"
        :tracks="playerStore.queue"
        :current-track-id="playerStore.currentTrackId"
        @play="playerStore.playTrack($event, true)"
        @remove="playerStore.removeFromQueue($event)"
      />
      <div
        class="now-playing__volume-popover"
        popover="auto"
        :id="VOLUME_POPOVER_ID"
      >
        <span> {{ playerStore.volumePercent }}% </span>
        <input
          class="now-playing__volume-slider"
          type="range"
          min="0"
          max="100"
          aria-label="音量"
          orient="vertical"
          :value="playerStore.volumePercent"
          :style="{ '--slider-value': playerStore.volumePercent + '%' }"
          @input="
            playerStore.setVolume(
              Number(($event.target as HTMLInputElement).value),
            )
          "
        />
      </div>
      <ContextMenu v-if="!isSmallScreen" ref="contextMenu" v-bind="menuProps" />
      <ActionSheet v-else ref="actionSheet" v-bind="menuProps" />
    </section>
  </BottomSheet>
</template>
