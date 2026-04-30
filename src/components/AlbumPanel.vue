<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Disc3, Pause, Play } from "lucide-vue-next";
import type { Track } from "../types";
import { formatTime } from "../utils/media";

interface AlbumGroup {
  name: string;
  artistLabel: string;
  trackCount: number;
  duration: number;
  coverUrl: string;
  tracks: Array<{ track: Track; index: number }>;
}

const props = defineProps<{
  albums: AlbumGroup[];
  selectedAlbumName: string;
  currentTrackIndex: number;
  isPlaying: boolean;
}>();

defineEmits<{
  selectAlbum: [albumName: string];
  playTrack: [trackIndex: number];
  playAlbum: [albumName: string];
}>();

const activeAlbum = computed(
  () => props.albums.find((a) => a.name === props.selectedAlbumName) ?? null,
);

// ─── 左侧：专辑列表虚拟滚动 ─────────────────────────────────────────────────
// album-item: padding(12+12) + cover(56) = 80px; grid gap = 10px → 90px/slot
const albumListRef = ref<HTMLElement | null>(null);

const albumVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.albums.length,
    getScrollElement: () => albumListRef.value,
    estimateSize: () => 90,
    overscan: 3,
  })),
);

const albumVirtualItems = computed(() =>
  albumVirtualizer.value.getVirtualItems().map((vRow) => ({
    vRow,
    album: props.albums[vRow.index],
  })),
);

const albumTotalSize = computed(() => albumVirtualizer.value.getTotalSize());
</script>

<template>
  <section class="library-panel album-browser">
    <div class="section-head">
      <div>
        <h2>专辑</h2>
      </div>
      <span class="library-status">{{
        albums.length ? `共 ${albums.length} 张专辑` : "等待扫描"
      }}</span>
    </div>

    <div v-if="albums.length" class="album-browser-body">
      <!-- 左侧：专辑列表 -->
      <aside ref="albumListRef" class="album-list">
        <div
          :style="{
            height: `${albumTotalSize}px`,
            position: 'relative',
            width: '100%',
          }"
        >
          <button
            v-for="{ vRow, album } in albumVirtualItems"
            :key="vRow.index"
            v-memo="[album.name === selectedAlbumName]"
            class="album-item"
            :class="{ 'is-active': album.name === selectedAlbumName }"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }"
            type="button"
            @click="$emit('selectAlbum', album.name)"
          >
            <div class="album-item-cover">
              <img
                v-if="album.coverUrl"
                :src="album.coverUrl"
                :alt="`${album.name} 封面`"
              />
              <Disc3 v-else :size="18" />
            </div>
            <div class="album-item-copy">
              <strong>{{ album.name }}</strong>
              <span>{{ album.artistLabel }}</span>
            </div>
            <span class="album-item-meta">{{ album.trackCount }} 首</span>
          </button>
        </div>
      </aside>

      <!-- 右侧：专辑详情 -->
      <section v-if="activeAlbum" class="album-detail">
        <div class="album-detail-head">
          <div class="album-detail-cover">
            <img
              v-if="activeAlbum.coverUrl"
              :src="activeAlbum.coverUrl"
              :alt="`${activeAlbum.name} 封面`"
            />
            <Disc3 v-else :size="34" />
          </div>
          <div class="album-detail-copy">
            <h3>{{ activeAlbum.name }}</h3>
            <span>{{ activeAlbum.artistLabel }}</span>
            <div class="album-detail-stats">
              <span>{{ activeAlbum.trackCount }} 首</span>
              <span>{{ formatTime(activeAlbum.duration) }}</span>
            </div>
          </div>
          <button
            class="primary-button album-play-button"
            type="button"
            @click="$emit('playAlbum', activeAlbum.name)"
          >
            <Play :size="16" />
            <span>播放专辑</span>
          </button>
        </div>

        <!-- 右侧曲目列表（曲目数量有限，无需虚拟滚动） -->
        <div class="album-song-list">
          <button
            v-for="({ track, index }, songOrder) in activeAlbum.tracks"
            :key="track.id"
            v-memo="[
              index === currentTrackIndex,
              index === currentTrackIndex && isPlaying,
            ]"
            class="album-song-row"
            :class="{ 'is-active': index === currentTrackIndex }"
            type="button"
            @click="$emit('playTrack', index)"
          >
            <div class="album-song-main">
              <div
                class="album-song-icon"
                :class="{
                  'is-playing': index === currentTrackIndex && isPlaying,
                }"
              >
                <Pause
                  v-if="index === currentTrackIndex && isPlaying"
                  :size="16"
                />
                <Play v-else :size="16" />
              </div>
              <div class="album-song-copy">
                <strong>{{ songOrder + 1 }}. {{ track.title }}</strong>
                <span>{{ track.artist || "未知歌手" }}</span>
              </div>
            </div>
            <span class="album-song-duration">{{
              formatTime(track.duration)
            }}</span>
          </button>
        </div>
      </section>
    </div>

    <div v-else class="empty-panel empty-panel--fill">
      <strong>还没有可展示的专辑</strong>
      <p>导入音乐后，这里会按专辑自动整理并展示其中的歌曲。</p>
    </div>
  </section>
</template>
