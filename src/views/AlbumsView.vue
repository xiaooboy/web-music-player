<script setup lang="ts">
import { shallowRef } from "vue";
import AlbumGrid from "../components/AlbumGrid.vue";
import SectionHeader from "../components/SectionHeader.vue";
import EmptyState from "../components/EmptyState.vue";
import { usePlayerStore, useAlbumStore, useUIStore } from "@/stores";

const albumStore = useAlbumStore();
const playerStore = usePlayerStore();
const uiStore = useUIStore();

function handlePlayAlbum(albumName: string) {
  albumStore.updatePlayingAlbum(albumName);
  playerStore.setPlaySourceType("albums");
  playerStore.playTrack(0, true);
}

function enterAlbum(albumName: string) {
  albumStore.selectAlbum(albumName);
  uiStore.setActiveView("album-detail");
}
</script>

<template>
  <section class="main-panel album-browser">
    <SectionHeader title="专辑">
      <template #right>
        <span class="library-status">
          {{
            albumStore.albums.length
              ? `${albumStore.albums.length} 张`
              : "等待扫描"
          }}
        </span>
      </template>
    </SectionHeader>

    <AlbumGrid
      v-if="albumStore.albums.length"
      :albums="albumStore.albums"
      :selectedAlbumName="albumStore.selectedAlbumName"
      @selectAlbum="enterAlbum"
      @playAlbum="handlePlayAlbum"
    />
    <EmptyState
      v-else
      title="还没有可展示的专辑"
      content="导入音乐后，这里会按专辑自动整理并展示其中的歌曲。"
      fill
    />
  </section>
</template>
