<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Disc3, Play } from "@lucide/vue";
import type { Album } from "../types";
import { ensureCoverUrl } from "../utils/coverCache";

interface Props {
  albums: Album[];
  selectedAlbumName: string;
}
const ROW_GAP = 30;

// 最少两列，基于容器宽度计算最小列宽
const MIN_COL_COUNT = 2;
const MAX_COL_WIDTH = 150;
const minColWidth = computed(() =>
  Math.floor(Math.min(MAX_COL_WIDTH, (containerWidth.value - ROW_GAP - 2 * 16) / MIN_COL_COUNT)),
);
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "selectAlbum", albumName: string): void;
  (e: "playAlbum", albumName: string): void;
}>();

const scrollRef = ref<HTMLElement | null>(null);
const containerWidth = shallowRef(window.innerWidth - 32);

let resizeObserver: ResizeObserver | null = null;

const columnCount = computed(() =>
  Math.max(
    1,
    Math.floor((containerWidth.value + ROW_GAP) / (minColWidth.value + ROW_GAP)),
  ),
);
const colWidth = computed(
  () =>
    (containerWidth.value - (columnCount.value - 1) * ROW_GAP) /
    columnCount.value,
);
const albumRows = computed(() => {
  const cols = columnCount.value;
  const rows: Album[][] = [];
  for (let i = 0; i < props.albums.length; i += cols) {
    rows.push(props.albums.slice(i, i + cols));
  }
  return rows;
});
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: albumRows.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => colWidth.value + 50 + ROW_GAP,
    overscan: 1,
  })),
);

// 列宽变化时清空尺寸缓存，使虚拟滚动器用新的 estimateSize 重新计算
watch(colWidth, () => {
  rowVirtualizer.value.measure();
});

const virtualRows = computed(() =>
  rowVirtualizer.value.getVirtualItems().map((vRow) => ({
    vRow,
    albums: albumRows.value[vRow.index],
  })),
);

const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

onMounted(() => {
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      containerWidth.value = entries[0].contentRect.width;
    });
    resizeObserver.observe(scrollRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

</script>

<template>
  <div ref="scrollRef" class="album-grid scroll-borrow">
    <div
      :style="{
        height: `${totalSize}px`,
        position: 'relative',
        width: '100%',
        '--min-col-width': `${minColWidth}px`,
        '--col-count': columnCount,
      }"
    >
      <div
        v-for="{ vRow, albums } in virtualRows"
        :key="String(vRow.key)"
        :data-index="vRow.index"
        class="album-grid__row"
        :style="{
          position: 'absolute',
          inset: '0 0 auto',
          height: `${vRow.size}px`,
          transform: `translateY(${vRow.start}px)`,
        }"
      >
        <button
          v-for="album in albums"
          :key="album.name"
          class="album-card"
          :class="{
            'album-card--active': album.name === selectedAlbumName,
          }"
          type="button"
          @click="emit('selectAlbum', album.name)"
        >
          <div class="album-card__cover">
            <img
              v-if="album.coverBlob"
              class="img-fadein"
              :src="ensureCoverUrl(album.name, album.coverBlob)"
              :alt="`${album.name} 封面`"
              :width="colWidth"
              :height="colWidth"
              loading="lazy"
            />
            <Disc3 v-else :size="32" class="album-card__placeholder" />
            <button
              class="album-card__play"
              type="button"
              :aria-label="`播放专辑 ${album.name}`"
              @click.stop="emit('playAlbum', album.name)"
            >
              <Play :size="20" />
            </button>
          </div>
          <div class="album-card__copy">
            <strong class="album-card__title truncate--block">{{
              album.name
            }}</strong>
            <span class="album-card__artist truncate--block">{{
              album.artistLabel
            }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
