<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Disc3, Pause, Play } from "lucide-vue-next";
import { formatTime } from "../utils/media";
import { useAlbumStore } from "../stores/albumStore";
import { usePlayerStore } from "../stores/playerStore";
import TipContent from "../components/TipContent.vue";

const albumStore = useAlbumStore();
const playerStore = usePlayerStore();

const activeAlbum = computed(
  () =>
    albumStore.albums.find((a) => a.name === albumStore.selectedAlbumName) ??
    null,
);

// ─── 左侧：专辑列表虚拟滚动 ─────────────────────────────────────────────────
const albumListRef = ref<HTMLElement | null>(null);

const albumVirtualizer = useVirtualizer(
  computed(() => ({
    count: albumStore.albums.length,
    getScrollElement: () => albumListRef.value,
    estimateSize: () => 90,
    overscan: 3,
  })),
);

const albumVirtualItems = computed(() =>
  albumVirtualizer.value.getVirtualItems().map((vRow) => ({
    vRow,
    album: albumStore.albums[vRow.index],
  })),
);

const albumTotalSize = computed(() => albumVirtualizer.value.getTotalSize());

function handleAlbumTrackSelect(albumName: string, id: string) {
  const targetAlbum = albumStore.albums.find(
    (album) => album.name === albumName,
  );
  if (!targetAlbum?.tracks.length) return;
  albumStore.selectedAlbumName = albumName;
  playerStore.setPlaySourceType("albums");
  playerStore.setPlaylist(targetAlbum.tracks);
  playerStore.playTrackById(id, true);
}

function handlePlayAlbum(albumName: string) {
  const targetAlbum = albumStore.albums.find(
    (album) => album.name === albumName,
  );
  if (!targetAlbum?.tracks.length) return;
  albumStore.selectedAlbumName = albumName;
  playerStore.setPlaySourceType("albums");
  playerStore.setPlaylist(targetAlbum.tracks);
  playerStore.playTrack(0, true);
}
</script>

<template>
  <section class="library-panel album-browser">
    <div class="section-head">
      <div>
        <h2>专辑</h2>
      </div>
      <span class="library-status">{{
        albumStore.albums.length
          ? `共 ${albumStore.albums.length} 张专辑`
          : "等待扫描"
      }}</span>
    </div>

    <div v-if="albumStore.albums.length" class="album-browser-body">
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
            :key="album.name + album.artistLabel"
            v-memo="[album.name === albumStore.selectedAlbumName]"
            class="album-item"
            :class="{
              'is-active': album.name === albumStore.selectedAlbumName,
            }"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }"
            type="button"
            @click="albumStore.selectedAlbumName = album.name"
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
            <span class="album-item-meta">{{ album.tracks.length }} 首</span>
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
              <span>{{ activeAlbum.tracks.length }} 首</span>
              <span>{{ formatTime(activeAlbum.duration) }}</span>
            </div>
          </div>
          <button
            class="primary-button album-play-button"
            type="button"
            @click="handlePlayAlbum(activeAlbum.name)"
          >
            <Play :size="16" />
            <span>播放专辑</span>
          </button>
        </div>

        <!-- 右侧曲目列表 -->
        <div class="album-song-list">
          <button
            v-for="(track, songOrder) in activeAlbum.tracks"
            :key="track.id"
            class="album-song-row"
            :class="{ 'is-active': track.id === playerStore.currentTrackId }"
            type="button"
            @click="handleAlbumTrackSelect(activeAlbum.name, track.id)"
          >
            <div class="album-song-main">
              <div
                class="album-song-icon"
                :class="{
                  'is-playing':
                    track.id === playerStore.currentTrackId &&
                    playerStore.isPlaying,
                }"
              >
                <Pause
                  v-if="
                    track.id === playerStore.currentTrackId &&
                    playerStore.isPlaying
                  "
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

    <TipContent
      v-else
      title="还没有可展示的专辑"
      content="导入音乐后，这里会按专辑自动整理并展示其中的歌曲。"
      fill
    />
  </section>
</template>
