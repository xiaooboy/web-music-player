<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
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

// ─── 虚拟滚动 ────────────────────────────────────────────────────────────────
// 无论曲库有多大，都只渲染视口内可见的行（约 15–20 行），
// 挂载和切换面板的耗时是 O(1) 而非 O(n)。
const listRef = ref<HTMLElement | null>(null);

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.tracks.length,
    getScrollElement: () => listRef.value,
    estimateSize: () => 62, // padding(10+10) + thumb(42) = 62px
    overscan: 5,
  })),
);

// 把虚拟行与 props.tracks 合并，让模板只需一次解构
const virtualItems = computed(() =>
  rowVirtualizer.value.getVirtualItems().map((vRow) => ({
    vRow,
    item: props.tracks[vRow.index],
  })),
);

const totalSize = computed(() => rowVirtualizer.value.getTotalSize());
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

    <div
      ref="listRef"
      class="track-list"
      :class="{ 'track-list--empty': !tracks.length }"
    >
      <template v-if="tracks.length">
        <!-- 撑起虚拟总高度，行用 absolute + translateY 定位 -->
        <div
          :style="{
            height: `${totalSize}px`,
            width: '100%',
            position: 'relative',
          }"
        >
          <div
            v-for="{ vRow, item } in virtualItems"
            :key="item.track.id"
            v-memo="[
              item.index === currentTrackIndex,
              item.index === currentTrackIndex && isPlaying,
              likedTrackIdSet.has(item.track.id),
            ]"
            class="track-row"
            :class="{ 'is-active': item.index === currentTrackIndex }"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }"
            @click="$emit('play', item.index)"
          >
            <div class="track-song">
              <div class="track-thumb">
                <img
                  v-if="item.track.coverUrl"
                  :src="item.track.coverUrl"
                  :alt="`${item.track.title} 封面`"
                />
                <span v-else>♪</span>
              </div>
              <div class="track-copy">
                <strong>{{ item.track.title }}</strong>
                <span>{{ item.track.artist }}</span>
              </div>
            </div>
            <div class="track-album">
              <strong>{{ item.track.album }}</strong>
            </div>
            <span class="track-duration">{{
              formatTime(item.track.duration)
            }}</span>
            <div class="row-action">
              <button
                class="row-play"
                :class="{
                  'is-playing': item.index === currentTrackIndex && isPlaying,
                }"
                type="button"
                :aria-label="
                  item.index === currentTrackIndex && isPlaying
                    ? '暂停'
                    : '播放'
                "
                @click.stop="$emit('play', item.index)"
              >
                <Pause
                  v-if="item.index === currentTrackIndex && isPlaying"
                  :size="18"
                />
                <Play v-else :size="18" />
              </button>
              <button
                class="row-like"
                :class="{ 'is-active': likedTrackIdSet.has(item.track.id) }"
                type="button"
                :aria-label="
                  likedTrackIdSet.has(item.track.id) ? '取消喜欢' : '标记喜欢'
                "
                @click.stop="$emit('toggleFavorite', item.index)"
              >
                <Heart
                  :size="16"
                  :fill="
                    likedTrackIdSet.has(item.track.id) ? 'currentColor' : 'none'
                  "
                />
              </button>
            </div>
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
                  '前往"音乐库管理"添加音乐源，或导入临时文件夹开始。'
          }}
        </p>
      </div>
    </div>
  </section>
</template>
