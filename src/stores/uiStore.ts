import { defineStore } from "pinia";
import { ref, watch } from "vue";
import {
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "@/utils/persistence";
import { withViewTransition } from "@/utils/media";

export type SectionName =
  | "all-track"
  | "favorites"
  | "albums"
  | "library-management";

export const useUIStore = defineStore("ui", () => {
  const currentView = ref<"library" | "detail">("library");
  const sidebarCollapsed = ref(loadSidebarCollapsed());
  const activeSection = ref<SectionName>("all-track");

  function setCurrentView(nextView: "library" | "detail") {
    if (currentView.value === nextView) return;
    // Mutation inside view transition so browsers can capture snapshots
    // currentView.value = nextView;

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

  function setActiveSection(section: SectionName) {
    // Wrap section change in view transition to animate panel switch consistently
    withViewTransition(() => {
      activeSection.value = section;
    });
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
  };
});
