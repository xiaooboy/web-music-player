import { defineStore } from "pinia";
import { shallowRef } from "vue";
import {
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "@/utils/persistence";
import { withViewTransition } from "@/utils/viewTransition";

export type SectionName =
  | "all-track" | "favorites" | "albums" | "album-detail" | "playlists" | "playlist-detail" | "library-management";

export const useUIStore = defineStore("ui", () => {
  const currentView = shallowRef<"library" | "detail">("library");
  const sidebarCollapsed = shallowRef(
    window.screen.width < 480 ? false : loadSidebarCollapsed(),
  );
  const activeSection = shallowRef<SectionName>("all-track");
  const sectionStack: SectionName[] = [];

  function setCurrentView(nextView: "library" | "detail") {
    if (currentView.value === nextView) return;
    // Mutation inside view transition so browsers can capture snapshots
    withViewTransition(() => {
      currentView.value = nextView;
    });
  }

  function openDetail() {
    setCurrentView("detail");
  }

  function closeDetail() {
    setCurrentView("library");
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    saveSidebarCollapsed(sidebarCollapsed.value);
  }

  function setActiveSection(section: SectionName, pushStack = true) {
    if (pushStack) {
      sectionStack.push(activeSection.value);
    }
    activeSection.value = section;
  }

  /** 弹出栈顶并导航回该 section，用于详情页返回 */
  function popSection() {
    const prev = sectionStack.pop();
    if (prev) activeSection.value = prev;
  }

  return {
    currentView,
    sidebarCollapsed,
    activeSection,
    setCurrentView,
    openDetail,
    closeDetail,
    toggleSidebar,
    setActiveSection,
    popSection,
  };
});
