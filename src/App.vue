<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, type Component } from "vue";
import { usePlayerStore, useLibraryStore, useUIStore } from "./stores";
import type { ViewName } from "./stores/uiStore";

import NowPlayingPanel from "./views/NowPlayingPanel.vue";
import PlayerDock from "./components/PlayerDock.vue";
import SidebarNav from "./components/SidebarNav.vue";
import FavoritesView from "./views/FavoritesView.vue";
import AlbumsView from "./views/AlbumsView.vue";
import AlbumDetailView from "./views/AlbumDetailView.vue";
import PlaylistsView from "./views/PlaylistsView.vue";
import PlaylistDetailView from "./views/PlaylistDetailView.vue";
import SourcesView from "./views/SourcesView.vue";
import TracksView from "./views/TracksView.vue";
import ToastContainer from "./components/ToastContainer.vue";
import { storeToRefs } from "pinia";

const playerStore = usePlayerStore();
const libraryStore = useLibraryStore();
const uiStore = useUIStore();
const { activeView } = storeToRefs(uiStore);

const viewComponents: Record<ViewName, Component> = {
  tracks: TracksView,
  favorites: FavoritesView,
  albums: AlbumsView,
  "album-detail": AlbumDetailView,
  playlists: PlaylistsView,
  "playlist-detail": PlaylistDetailView,
  sources: SourcesView,
};

// 无障碍：屏幕阅读器状态播报
const screenReaderAnnouncement = computed(() => {
  const track = playerStore.currentTrack;
  if (!track) return "";
  const state = playerStore.isPlaying ? "正在播放" : "已暂停";
  return `${state}：${track.title} - ${track.artist}`;
});

onBeforeUnmount(() => {
  playerStore.dispose();
  libraryStore.disposeLibrary();
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("contextmenu", handleContextMenuBlock);
  if (
    typeof window.launchQueue !== "undefined" &&
    typeof window.launchQueue.setConsumer === "function"
  ) {
    window.launchQueue.setConsumer(() => {});
  }
});

onMounted(() => {
  playerStore.initMediaSession();
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("contextmenu", handleContextMenuBlock);
  // 移动端默认显示 main-stage
  if (window.innerWidth <= 480) {
    // 无动画滚动
    document.querySelector(".app-shell")?.scroll({
      left: 200,
      behavior: "instant",
    });
  }

  if (
    typeof window.launchQueue !== "undefined" &&
    typeof window.launchQueue.setConsumer === "function"
  ) {
    window.launchQueue.setConsumer(
      ({ files }: { files: FileSystemFileHandle[] }) => {
        // 文件启动
        const isFileLaunch = Boolean(files.length);
        libraryStore.isFileLaunch = isFileLaunch;
        if (isFileLaunch) {
          libraryStore.handleLaunchedMusicFiles(files || []);
        }
      },
    );
  }
  // 普通启动
  if (!libraryStore.isFileLaunch) libraryStore.restoreCachedLibrary();
});

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
    return;
  }

  switch (event.key) {
    case " ":
      event.preventDefault();
      playerStore.togglePlay();
      break;
    case "f":
    case "F":
      uiStore.openNowPlaying();
      break;
  }
}

function handleContextMenuBlock(event: MouseEvent) {
  // 允许音乐行上的右键菜单，其他位置阻止默认行为
  const target = event.target as HTMLElement;
  if (target.closest(".track-table__row")) return;
  event.preventDefault();
}
</script>

<template>
  <div class="region-bar"></div>
  <div
    class="app-shell"
    role="application"
    aria-label="LocalMusic 本地音乐播放器"
  >
    <SidebarNav />

    <main class="main-stage" aria-label="音乐库">
      <Transition name="section-slide" mode="out-in">
        <component :is="viewComponents[activeView]" :key="activeView" />
      </Transition>
    </main>

    <PlayerDock />
  </div>
  <NowPlayingPanel />
  <ToastContainer />
  <div aria-live="polite" aria-atomic="true" class="sr-only">
    {{ screenReaderAnnouncement }}
  </div>
</template>
