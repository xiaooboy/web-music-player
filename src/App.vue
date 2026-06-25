<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed } from "vue";
import { usePlayerStore, useLibraryStore, useUIStore } from "./stores";

import MusicDetailPanel from "./components/MusicDetailPanel.vue";
import PlayerDock from "./components/PlayerDock.vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import FavoritesView from "./views/FavoritesView.vue";
import AlbumsView from "./views/AlbumsView.vue";
import LibraryManagementView from "./views/LibraryManagementView.vue";
import { storeToRefs } from "pinia";
import AllTrackView from "./views/AllTrackView.vue";

const playerStore = usePlayerStore();
const libraryStore = useLibraryStore();
const uiStore = useUIStore();
const { currentView, activeSection } = storeToRefs(uiStore);

onBeforeUnmount(() => {
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
    document.querySelector(".app-shell")?.scrollTo(200, 0);
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
    case "Escape":
      if (uiStore.currentView === "detail") {
        uiStore.setCurrentView("library");
      }
      break;
    case " ":
      event.preventDefault();
      playerStore.togglePlay();
      break;
    case "f":
    case "F":
      uiStore.setCurrentView(
        uiStore.currentView === "detail" ? "library" : "detail",
      );
      break;
  }
}

function handleContextMenuBlock(event: MouseEvent) {
  event.preventDefault();
}
</script>

<template>
  <div class="region-bar"></div>
  <div
    class="app-shell"
    :class="{ 'sidebar-collapsed': uiStore.sidebarCollapsed }"
  >
    <SidebarPanel />

    <main class="main-stage">
      <AllTrackView v-show="activeSection === 'all-track'" />
      <FavoritesView v-show="activeSection === 'favorites'" />
      <AlbumsView v-show="activeSection === 'albums'" />
      <LibraryManagementView v-show="activeSection === 'library-management'" />
    </main>

    <PlayerDock />
  </div>
  <div v-show="currentView === 'detail'" class="detail-shell">
    <main class="detail-stage">
      <MusicDetailPanel />
    </main>
  </div>
  <audio
    :ref="playerStore.setAudioRef"
    preload="metadata"
    @timeupdate="playerStore.handleTimeUpdate"
    @loadedmetadata="playerStore.handleLoadedMetadata"
    @play="playerStore.handleAudioPlay"
    @pause="playerStore.handleAudioPause"
    @ended="playerStore.handleAudioEnded"
  ></audio>
</template>
