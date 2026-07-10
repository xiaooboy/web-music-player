<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Disc3, Play } from "@lucide/vue";
import type { Album } from "../types";

// ─── 事件委托：图片加载完成 ──────────────────────────────────────────────────────
function handleImgLoad(event: Event) {
  const target = event.target as HTMLElement;
  if (target.tagName === "IMG") {
    target.classList.add("is-loaded");
  }
}

interface Props {
  albums: Album[];
  selectedAlbumName: string;
  transitionTarget?: string;
  viewTransitionName?: string;
}
const MIN_COL_WIDTH = 150;
const ROW_GAP = 30;
const ROW_HEIGHT = 190;
const PADDING_RIGHT = 4;
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "selectAlbum", albumName: string): void;
  (e: "playAlbum", albumName: string): void;
}>();

const scrollRef = ref<HTMLElement | null>(null);
const containerWidth = shallowRef(800);
const measureCache = ref({
  containerWidth: containerWidth.value,
  rowHeight: -1,
});
let resizeObserver: ResizeObserver | null = null;

const columnCount = computed(() =>
  Math.max(
    1,
    Math.floor(
      (containerWidth.value - PADDING_RIGHT + ROW_GAP) /
        (MIN_COL_WIDTH + ROW_GAP),
    ),
  ),
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
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: 2,
    measureElement: (el: Element) => {
      const { containerWidth: cachedWidth, rowHeight: cachedHeight } =
        measureCache.value;
      if (cachedHeight !== -1 && cachedWidth === containerWidth.value)
        return cachedHeight;
      const height = ((el as HTMLElement).offsetHeight ?? 0) + ROW_GAP;
      measureCache.value.rowHeight = height;
      measureCache.value.containerWidth = containerWidth.value;
      return height;
    },
  })),
);

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
  <div ref="scrollRef" class="album-grid-scroll" @load.capture="handleImgLoad">
    <div
      :style="{
        height: `${totalSize}px`,
        position: 'relative',
        width: '100%',
        '--min-col-width': `${MIN_COL_WIDTH}px`,
      }"
    >
      <div
        v-for="{ vRow, albums } in virtualRows"
        :key="String(vRow.key)"
        :ref="(el: any) => rowVirtualizer.measureElement(el)"
        :data-index="vRow.index"
        class="album-grid-row"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          paddingRight: `${PADDING_RIGHT}px`,
          right: 0,
          transform: `translateY(${vRow.start}px)`,
        }"
      >
        <button
          v-for="album in albums"
          :key="album.name + album.artistLabel"
          class="album-card"
          :class="{
            'is-active': album.name === selectedAlbumName,
          }"
          type="button"
          @click="emit('selectAlbum', album.name)"
        >
          <div class="album-card-cover">
            <img
              v-if="album.coverUrl"
              class="img-fadein"
              :src="album.coverUrl"
              :alt="`${album.name} 封面`"
              :width="MIN_COL_WIDTH"
              :height="MIN_COL_WIDTH"
              :style="
                album.name === transitionTarget
                  ? { 'view-transition-name': viewTransitionName }
                  : undefined
              "
              loading="lazy"
            />
            <Disc3 v-else :size="32" class="album-card-placeholder" />
            <button
              class="album-card-play"
              type="button"
              :aria-label="`播放专辑 ${album.name}`"
              @click.stop="emit('playAlbum', album.name)"
            >
              <Play :size="20" />
            </button>
          </div>
          <div class="album-card-copy">
            <strong class="album-card-title">{{ album.name }}</strong>
            <span class="album-card-artist">{{ album.artistLabel }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
