<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Heart, Pause, Play } from "lucide-vue-next";
import TipContent from "./TipContent.vue";
import type { Track } from "../types";
import { formatTime } from "../utils/media";

const props = defineProps<{
  tracks: Track[];
  loading: boolean;
  loadingDone: number;
  loadingTotal: number;
  currentTrackId: string;
  isPlaying: boolean;
  status: string;
  likedTrackIdSet: Set<string>;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}>();

const emit = defineEmits<{
  play: [id: string];
  toggleFavorite: [id: string];
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

const tipTitle = computed(() => {
  if (props.loading) return "正在整理你的曲库";
  if (props.tracks.length) return "没有匹配到结果";
  return props.emptyTitle || "你的本地曲库还没接入";
});

const tipContent = computed(() => {
  if (props.loading)
    return `已处理 ${props.loadingDone} / ${props.loadingTotal} 首歌曲，请稍候。`;
  if (props.tracks.length)
    return "换个关键词试试，或者清空搜索框查看全部曲目。";
  return props.emptyDescription || '前往"音乐库"添加音乐源。';
});
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
            :key="item.id"
            class="track-row"
            :class="{ 'is-active': item.id === currentTrackId }"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }"
            @click="$emit('play', item.id)"
          >
            <div class="track-song">
              <div class="track-thumb">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  :alt="`${item.title} 封面`"
                />
                <!-- <span v-else>♪</span> -->
              </div>
              <div class="track-copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.artist }}</span>
              </div>
            </div>
            <div class="track-album">
              <strong>{{ item.album }}</strong>
            </div>
            <span class="track-duration">{{ formatTime(item.duration) }}</span>
            <div class="row-action">
              <button
                class="row-play"
                :class="{
                  'is-playing': item.id === currentTrackId && isPlaying,
                }"
                type="button"
                :aria-label="
                  item.id === currentTrackId && isPlaying ? '暂停' : '播放'
                "
                @click.stop="$emit('play', item.id)"
              >
                <Pause
                  v-if="item.id === currentTrackId && isPlaying"
                  :size="18"
                />
                <Play v-else :size="18" />
              </button>
              <button
                class="row-like"
                :class="{ 'is-active': likedTrackIdSet.has(item.id) }"
                type="button"
                :aria-label="
                  likedTrackIdSet.has(item.id) ? '取消喜欢' : '标记喜欢'
                "
                @click.stop="$emit('toggleFavorite', item.id)"
              >
                <Heart
                  :size="16"
                  :fill="likedTrackIdSet.has(item.id) ? 'currentColor' : 'none'"
                />
              </button>
            </div>
          </div>
        </div>
      </template>

      <TipContent v-else :title="tipTitle" :content="tipContent" />
    </div>
  </section>
</template>
