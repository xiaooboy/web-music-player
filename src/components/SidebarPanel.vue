<script setup lang="ts">
import { Disc3, Heart, Library, House, Menu } from "lucide-vue-next";
import { useUIStore } from "../stores/uiStore";
import type { SectionName } from "../stores/uiStore";

const uiStore = useUIStore();

const navItems: { name: SectionName; title: string; icon: typeof House }[] = [
  { name: "playlist", title: "播放列表", icon: House },
  { name: "favorites", title: "收藏", icon: Heart },
  { name: "albums", title: "专辑", icon: Disc3 },
  { name: "library-management", title: "音乐库", icon: Library },
];

function switchSection(name: SectionName) {
  uiStore.setActiveSection(name);
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-collapsed': uiStore.sidebarCollapsed }">
    <div class="brand brand--placeholder" aria-hidden="true">
      <button
        class="collapse-btn"
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
        :title="item.title"
        :class="{ 'is-active': uiStore.activeSection === item.name }"
        type="button"
        @click="switchSection(item.name)"
      >
        <span class="nav-icon"><component :is="item.icon" :size="26" /></span>
        <span v-if="!uiStore.sidebarCollapsed" class="nav-label">{{
          item.title
        }}</span>
      </button>
    </div>
  </aside>
</template>
