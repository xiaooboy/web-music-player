<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Heart, MoreVertical, Pause, Play, LocateFixed } from "@lucide/vue";
import TipContent from "./TipContent.vue";
import ContextMenu from "./ContextMenu.vue";
import type { Track } from "../types";
import { formatTime } from "../utils/media";
import { useTrackContextMenu } from "../composables/useTrackContextMenu";

const props = defineProps<{
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  likedTrackIdSet: Set<string>;
  emptyTitle?: string;
  emptyDescription?: string;
}>();

const emit = defineEmits<{
  play: [id: string];
  togglePlay: [];
  toggleFavorite: [id: string];
  navigateToAlbum: [albumName: string];
}>();

// ─── 右键菜单 ────────────────────────────────────────────────────────────────
const { menuProps, open: openContextMenu } = useTrackContextMenu();

function handleContextMenu(event: MouseEvent, track: Track) {
  event.preventDefault();
  event.stopPropagation();
  openContextMenu(track, event);
}

function handleMoreKeydown(event: KeyboardEvent, track: Track) {
  if (event.key === 'F10' && event.shiftKey) {
    event.preventDefault();
    openContextMenu(track);
  } else if (event.key === 'ContextMenu') {
    event.preventDefault();
    openContextMenu(track);
  }
}

// ─── 虚拟滚动 ────────────────────────────────────────────────────────────────
// 无论曲库有多大，都只渲染视口内可见的行（约 15–20 行），
// 挂载和切换面板的耗时是 O(1) 而非 O(n)。
const listRef = ref<HTMLElement | null>(null);

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.tracks.length,
    getScrollElement: () => listRef.value,
    estimateSize: () => 64, // padding(10+10) + thumb(44) = 64px
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

// 维护 id → index 映射，避免每次滚动时 O(n) 查找
const indexIdMap = computed(() => {
  const map = new Map<string, number>();
  for (let i = 0; i < props.tracks.length; i++) {
    map.set(props.tracks[i].id, i);
  }
  return map;
});

function scrollToCurrentTrack() {
  if (!props.currentTrackId || !props.tracks.length) return;
  const idx = indexIdMap.value.get(props.currentTrackId);
  if (idx === undefined) return;
  rowVirtualizer.value.scrollToIndex(idx, {
    behavior: "smooth",
    align: "center",
  });
}
</script>

<template>
  <section class="track-table" role="grid" aria-label="歌曲列表">
    <div v-if="tracks.length" class="track-header" role="row">
      <span role="columnheader">{{ tracks.length }} 首</span>
      <span role="columnheader">专辑</span>
      <span role="columnheader">时长</span>
      <span role="columnheader">操作</span>
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
            tabindex="0"
            role="row"
            :aria-label="`${item.title}，${item.artist}，${item.album}，${formatTime(item.duration)}`"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }"
            @click="$emit('play', item.id)"
            @keydown.enter="
              ($event.target as HTMLElement).closest('button')
                ? undefined
                : $emit('play', item.id)
            "
            @contextmenu="handleContextMenu($event, item)"
          >
            <div class="track-song">
              <div class="track-thumb">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  :alt="`${item.title} 封面`"
                  loading="lazy"
                />
                <!-- <span v-else>♪</span> -->
              </div>
              <div class="track-copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.artist }}</span>
              </div>
            </div>
            <div class="track-album">
              <strong
                class="album-link"
                role="link"
                tabindex="0"
                :aria-label="`查看专辑：${item.album}`"
                @click.stop="emit('navigateToAlbum', item.album)"
                @keydown.enter.stop="emit('navigateToAlbum', item.album)"
              >{{ item.album }}</strong>
            </div>
            <span class="track-duration">{{ formatTime(item.duration) }}</span>
            <div class="row-action">
              <button
                class="row-play"
                :class="{
                  'is-playing': item.id === currentTrackId && isPlaying,
                }"
                type="button"
                :title="
                  item.id === currentTrackId && isPlaying ? '暂停' : '播放'
                "
                :aria-label="
                  item.id === currentTrackId && isPlaying ? '暂停' : '播放'
                "
                @click.stop="
                  item.id === currentTrackId && isPlaying
                    ? $emit('togglePlay')
                    : $emit('play', item.id)
                "
              >
                <Pause
                                  v-if="item.id === currentTrackId && isPlaying"
                                  :size="20"
                                />
                                <Play v-else :size="20" />
              </button>
              <button
                class="row-like"
                :class="{ 'is-active': likedTrackIdSet.has(item.id) }"
                type="button"
                :title="likedTrackIdSet.has(item.id) ? '取消喜欢' : '标记喜欢'"
                :aria-label="
                  likedTrackIdSet.has(item.id) ? '取消喜欢' : '标记喜欢'
                "
                @click.stop="$emit('toggleFavorite', item.id)"
              >
                <Heart
                                  :size="20"
                  :fill="likedTrackIdSet.has(item.id) ? 'currentColor' : 'none'"
                />
              </button>
              <button
                class="row-more"
                type="button"
                title="更多操作"
                aria-label="更多操作"
                aria-haspopup="menu"
                @click.stop="handleContextMenu($event, item)"
                @keydown="handleMoreKeydown($event, item)"
              >
                <MoreVertical :size="20" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <TipContent v-else :title="emptyTitle" :content="emptyDescription" />
    </div>

    <!-- 滚动到当前音乐按钮 -->
    <button
      v-if="currentTrackId && tracks.length"
      class="scroll-to-current"
      type="button"
      aria-label="滚动到当前播放音乐"
      title="滚动到当前播放音乐"
      @click="scrollToCurrentTrack"
    >
      <LocateFixed :size="20" />
    </button>

    <!-- 右键菜单 -->
    <ContextMenu ref="contextMenu" v-bind="menuProps" />
  </section>
</template>
