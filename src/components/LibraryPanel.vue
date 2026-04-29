<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Heart, Pause, Play } from "lucide-vue-next";
import type { Track } from "../types";
import { formatTime } from "../utils/media";

const props = defineProps<{
  tracks: Array<{ track: Track; index: number }>;
  hasTracks: boolean;
  loading: boolean;
  loadingDone: number;
  loadingTotal: number;
  currentTrackIndex: number;
  isPlaying: boolean;
  status: string;
  likedTrackIdSet: Set<string>;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}>();

defineEmits<{
  play: [index: number];
  toggleFavorite: [index: number];
}>();

// ─── 渐进渲染 ────────────────────────────────────────────────────────────────
// 挂载时先渲染前 INITIAL_RENDER_COUNT 行，其余在下一帧补全，
// 确保切换面板时第一帧立即出现内容，不阻塞浏览器绘制。
const INITIAL_RENDER_COUNT = 80;
const renderCount = ref(INITIAL_RENDER_COUNT);

const displayedTracks = computed(() =>
  props.tracks.length <= renderCount.value
    ? props.tracks
    : props.tracks.slice(0, renderCount.value),
);

onMounted(() => {
  if (props.tracks.length > INITIAL_RENDER_COUNT) {
    requestAnimationFrame(() => {
      renderCount.value = props.tracks.length;
    });
  }
});

// 加载过程中 tracks 持续增长时，同步扩展渲染窗口
watch(
  () => props.tracks.length,
  (length) => {
    if (length > renderCount.value) {
      requestAnimationFrame(() => {
        renderCount.value = length;
      });
    }
  },
);
</script>

<template>
  <section class="library-panel">
    <div class="section-head">
      <div>
        <h2>{{ title || "已导入曲目" }}</h2>
      </div>
      <span class="library-status">{{ status }}</span>
    </div>

    <div v-if="tracks.length" class="track-header">
      <span>歌曲</span>
      <span>专辑</span>
      <span>时长</span>
      <span>操作</span>
    </div>

    <div class="track-list" :class="{ 'track-list--empty': !tracks.length }">
      <template v-if="tracks.length">
        <div
          v-for="{ track, index } in displayedTracks"
          :key="track.id"
          v-memo="[
            index === currentTrackIndex,
            index === currentTrackIndex && isPlaying,
            likedTrackIdSet.has(track.id),
          ]"
          class="track-row"
          :class="{ 'is-active': index === currentTrackIndex }"
          @click="$emit('play', index)"
        >
          <div class="track-song">
            <div class="track-thumb">
              <img
                v-if="track.coverUrl"
                :src="track.coverUrl"
                :alt="`${track.title} 封面`"
              />
              <span v-else>♪</span>
            </div>
            <div class="track-copy">
              <strong>{{ track.title }}</strong>
              <span>{{ track.artist }}</span>
            </div>
          </div>
          <div class="track-album">
            <strong>{{ track.album }}</strong>
          </div>
          <span class="track-duration">{{ formatTime(track.duration) }}</span>
          <div class="row-action">
            <button
              class="row-like"
              :class="{ 'is-active': likedTrackIdSet.has(track.id) }"
              type="button"
              :aria-label="
                likedTrackIdSet.has(track.id) ? '取消喜欢' : '标记喜欢'
              "
              @click.stop="$emit('toggleFavorite', index)"
            >
              <Heart
                :size="16"
                :fill="likedTrackIdSet.has(track.id) ? 'currentColor' : 'none'"
              />
            </button>
            <button
              class="row-play"
              type="button"
              :aria-label="
                index === currentTrackIndex && isPlaying ? '暂停' : '播放'
              "
              @click.stop="$emit('play', index)"
            >
              <Pause
                v-if="index === currentTrackIndex && isPlaying"
                :size="18"
              />
              <Play v-else :size="18" />
            </button>
          </div>
        </div>
      </template>

      <div v-else class="empty-panel empty-panel--fill">
        <strong>{{
          loading
            ? "正在整理你的曲库"
            : hasTracks
              ? "没有匹配到结果"
              : emptyTitle || "你的本地曲库还没接入"
        }}</strong>
        <p>
          {{
            loading
              ? `已处理 ${loadingDone} / ${loadingTotal} 首歌曲，请稍候。`
              : hasTracks
                ? "换个关键词试试，或者清空搜索框查看全部曲目。"
                : emptyDescription ||
                  "前往“音乐库管理”添加音乐源，或导入临时文件夹开始。"
          }}
        </p>
      </div>
    </div>
  </section>
</template>
