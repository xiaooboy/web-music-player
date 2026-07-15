import { defineStore } from "pinia";
import { shallowRef } from "vue";
import {
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "@/utils/persistence";
import { withViewTransition } from "@/utils/viewTransition";

export type ViewName =
  | "tracks" | "favorites" | "albums" | "album-detail"
  | "playlists" | "playlist-detail" | "sources";

export const useUIStore = defineStore("ui", () => {
  const activeView = shallowRef<ViewName>("tracks");
  const nowPlayingOpen = shallowRef(false);
  const sidebarCollapsed = shallowRef(
    window.screen.width < 480 ? false : loadSidebarCollapsed(),
  );

  const viewStack: ViewName[] = [];

  function setActiveView(view: ViewName, pushStack = true) {
    if (pushStack) {
      viewStack.push(activeView.value);
    }
    activeView.value = view;
  }

  /** 弹出栈顶并导航回该 view，用于详情页返回 */
  function popView() {
    const prev = viewStack.pop();
    if (prev) activeView.value = prev;
  }

  function openNowPlaying() {
    nowPlayingOpen.value = true;
  }

  function closeNowPlaying() {
    nowPlayingOpen.value = false;
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    saveSidebarCollapsed(sidebarCollapsed.value);
  }

  return {
    activeView,
    nowPlayingOpen,
    sidebarCollapsed,
    setActiveView,
    popView,
    openNowPlaying,
    closeNowPlaying,
    toggleSidebar,
  };
});
