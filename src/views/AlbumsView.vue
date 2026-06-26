<script setup lang="ts">
import { computed, nextTick, shallowRef } from "vue";
import AlbumGrid from "../components/AlbumGrid.vue";
import SectionHead from "../components/SectionHead.vue";
import AlbumDetail from "../components/AlbumDetail.vue";
import TipContent from "../components/TipContent.vue";
import { usePlayerStore, useAlbumStore } from "@/stores";
import { withViewTransition } from "@/utils/media";
const VIEW_TRANSITION_NAME = "album-cover";
const albumStore = useAlbumStore();
const playerStore = usePlayerStore();

const detailViewTransitionName = shallowRef("");
const albumViewTransitionName = shallowRef("");
const transitionTarget = shallowRef("");

const showDetail = computed(() => !!albumStore.selectedAlbumName);
const activeAlbum = computed(
  () =>
    albumStore.albums.find((a) => a.name === albumStore.selectedAlbumName) ??
    null,
);
const playingTrackId = computed(() => {
  return playerStore.isPlaying ? playerStore.currentTrackId : "";
});

function handlePlayTrack(albumName: string, id: string) {
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
async function handleBack() {
  detailViewTransitionName.value = VIEW_TRANSITION_NAME;
  nextTick(async () => {
    const { support, transition } = withViewTransition(() => {
      detailViewTransitionName.value = ""; // 不能同时出现同名的元素
      albumViewTransitionName.value = VIEW_TRANSITION_NAME;
      albumStore.clearSelection();
    });
    if (!support) return;
    await transition.finished;
    albumViewTransitionName.value = "";
  });
}
function enterAlbum(albumName: string) {
  transitionTarget.value = albumName;
  albumViewTransitionName.value = VIEW_TRANSITION_NAME;
  nextTick(async () => {
    const { support, transition } = withViewTransition(() => {
      albumViewTransitionName.value = ""; // 不能同时出现同名的元素
      detailViewTransitionName.value = VIEW_TRANSITION_NAME;
      albumStore.selectAlbum(albumName);
    });
    if (!support) return;
    await transition.finished;
    detailViewTransitionName.value = "";
  });
}
function handleStop() {
  playerStore.togglePlay();
}
</script>

<template>
  <section class="main-panel album-browser">
    <SectionHead
      v-if="!showDetail"
      title="专辑"
      :status="
        albumStore.albums.length ? `${albumStore.albums.length} 张` : '等待扫描'
      "
    />
    <AlbumDetail
      v-if="showDetail"
      :album="activeAlbum"
      :playingTrackId="playingTrackId"
      :viewTransitionName="detailViewTransitionName"
      :style="{
        position: 'absolute',
        inset: 0,
      }"
      @back="handleBack"
      @playAlbum="handlePlayAlbum"
      @playTrack="handlePlayTrack"
      @stop="handleStop"
    />
    <AlbumGrid
      v-if="albumStore.albums.length"
      :albums="albumStore.albums"
      :selectedAlbumName="albumStore.selectedAlbumName"
      :viewTransitionName="albumViewTransitionName"
      :transitionTarget="transitionTarget"
      @selectAlbum="enterAlbum"
      :style="{
        visibility: showDetail ? 'hidden' : 'visible',
      }"
    />
    <TipContent
      v-else
      title="还没有可展示的专辑"
      content="导入音乐后，这里会按专辑自动整理并展示其中的歌曲。"
      fill
    />
  </section>
</template>
