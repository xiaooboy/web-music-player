<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { usePlayerStore, useLibraryStore, useUIStore } from "./stores";

import MusicDetailPanel from "./components/MusicDetailPanel.vue";
import PlayerDock from "./components/PlayerDock.vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import FavoritesView from "./views/FavoritesView.vue";
import AlbumsView from "./views/AlbumsView.vue";
import PlaylistsView from "./views/PlaylistsView.vue";
import LibraryManagementView from "./views/LibraryManagementView.vue";
import { storeToRefs } from "pinia";
import AllTrackView from "./views/AllTrackView.vue";
import ToastContainer from "./components/ToastContainer.vue";

const playerStore = usePlayerStore();
const libraryStore = useLibraryStore();
const uiStore = useUIStore();
const { currentView, activeSection } = storeToRefs(uiStore);

// ─── 无障碍：视图切换时自动转移焦点 ────────────────────────────────────────────
let previouslyFocusedElement: HTMLElement | null = null;

watch(currentView, (view) => {
  if (view === 'detail') {
    previouslyFocusedElement = document.activeElement as HTMLElement;
    nextTick(() => {
      const backBtn = document.querySelector<HTMLButtonElement>(
        '.detail-head .icon-button',
      );
      backBtn?.focus();
    });
  } else {
    // 返回列表时将焦点还给之前的元素
    nextTick(() => {
      previouslyFocusedElement?.focus();
      previouslyFocusedElement = null;
    });
  }
});

// ─── 无障碍：屏幕阅读器状态播报 ──────────────────────────────────────────────
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
    case "Escape":
      if (document.querySelector("[popover]:popover-open")) break;
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
  // 允许音乐行上的右键菜单，其他位置阻止默认行为
  const target = event.target as HTMLElement;
  if (target.closest(".track-row")) return;
  event.preventDefault();
}
</script>

<template>
  <div class="region-bar"></div>
  <div
    class="app-shell"
    :class="{ 'sidebar-collapsed': uiStore.sidebarCollapsed }"
    role="application"
    aria-label="LocalMusic 本地音乐播放器"
  >
    <SidebarPanel />

    <main class="main-stage" aria-label="音乐库">
      <AllTrackView v-if="activeSection === 'all-track'" />
      <FavoritesView v-else-if="activeSection === 'favorites'" />
      <AlbumsView v-else-if="activeSection === 'albums'" />
      <PlaylistsView v-else-if="activeSection === 'playlists'" />
      <LibraryManagementView v-else />
    </main>

    <PlayerDock />
  </div>
  <div v-show="currentView === 'detail'" class="detail-shell">
    <main class="detail-stage" aria-label="播放详情">
      <MusicDetailPanel />
    </main>
  </div>
  <ToastContainer />
  <div aria-live="polite" aria-atomic="true" class="sr-only">
    {{ screenReaderAnnouncement }}
  </div>
</template>


