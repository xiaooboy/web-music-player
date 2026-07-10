<script setup lang="ts">
import { Disc3, Heart, House, Menu, ListMusic, Folder } from "@lucide/vue";
import { useUIStore } from "../stores/uiStore";
import type { SectionName } from "../stores/uiStore";
import { onMounted } from "vue";

const uiStore = useUIStore();

const navItems: { name: SectionName; title: string; icon: typeof House }[] = [
  { name: "all-track", title: "歌曲", icon: House },
  { name: "favorites", title: "收藏", icon: Heart },
  { name: "albums", title: "专辑", icon: Disc3 },
  { name: "playlists", title: "歌单", icon: ListMusic },
  { name: "library-management", title: "音乐源", icon: Folder },
];
let mainStage: HTMLDivElement | null = null;
const screenWidth = window.screen.width;

onMounted(() => {
  mainStage = document.querySelector(".main-stage");
});
function switchSection(name: SectionName) {
  uiStore.setActiveSection(name);
  // 小屏下点击导航后滚动到主内容区
  if (screenWidth <= 480) {
    mainStage?.scrollIntoView({ behavior: "smooth" });
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-collapsed': uiStore.sidebarCollapsed }" role="navigation" aria-label="主导航">
    <div class="brand brand--placeholder" aria-hidden="true">
      <button
        class="collapse-btn"
        :aria-label="uiStore.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        :title="uiStore.sidebarCollapsed ? '展开' : '折叠'"
        type="button"
        @click="uiStore.toggleSidebar()"
      >
        <Menu :size="26" />
      </button>
    </div>

    <div class="nav-panel">
      <button
        v-for="item in navItems"
        :key="item.name"
        class="nav-item"
        :aria-label="item.title"
        :title="item.title"
        :class="{ 'is-active': uiStore.activeSection === item.name }"
        type="button"
        @click="switchSection(item.name)"
      >
        <span class="nav-icon"><component :is="item.icon" :size="26" /></span>
        <span class="nav-label">{{ item.title }}</span>
      </button>
    </div>
  </aside>
</template>
