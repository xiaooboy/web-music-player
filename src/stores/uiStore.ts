import { defineStore } from "pinia";
import { ref } from "vue";
import { withViewTransition } from "@/utils/media";

export type SectionName =
  | "playlist"
  | "favorites"
  | "albums"
  | "library-management";

export const useUIStore = defineStore("ui", () => {
  const currentView = ref<"library" | "detail">("library");
  const sidebarCollapsed = ref(false);
  const activeSection = ref<SectionName>("playlist");

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
