<script setup lang="ts">
import { Disc3, Heart, Library, House, Menu } from "lucide-vue-next";

defineProps<{
  activeSection: "playlist" | "favorites" | "albums" | "library-management";
  collapsed: boolean;
}>();

defineEmits<{
  switchSection: [
    section: "playlist" | "favorites" | "albums" | "library-management",
  ];
  toggleCollapse: [];
}>();
</script>

<template>
  <aside class="sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="brand brand--placeholder" aria-hidden="true">
      <button
        class="collapse-btn"
        :title="collapsed ? '展开' : '折叠'"
        type="button"
        @click="$emit('toggleCollapse')"
      >
        <Menu :size="26" />
      </button>
    </div>

    <div class="nav-panel">
      <button
        class="nav-item"
        title="播放列表"
        :class="{ 'is-active': activeSection === 'playlist' }"
        type="button"
        @click="$emit('switchSection', 'playlist')"
      >
        <span class="nav-icon"><House :size="26" /></span>
        <span v-if="!collapsed" class="nav-label">播放列表</span>
      </button>
      <button
        class="nav-item"
        title="收藏"
        :class="{ 'is-active': activeSection === 'favorites' }"
        type="button"
        @click="$emit('switchSection', 'favorites')"
      >
        <span class="nav-icon"><Heart :size="26" /></span>
        <span v-if="!collapsed" class="nav-label">收藏</span>
      </button>
      <button
        class="nav-item"
        title="专辑"
        :class="{ 'is-active': activeSection === 'albums' }"
        type="button"
        @click="$emit('switchSection', 'albums')"
      >
        <span class="nav-icon"><Disc3 :size="26" /></span>
        <span v-if="!collapsed" class="nav-label">专辑</span>
      </button>
      <button
        class="nav-item"
        title="音乐库管理"
        :class="{ 'is-active': activeSection === 'library-management' }"
        type="button"
        @click="$emit('switchSection', 'library-management')"
      >
        <span class="nav-icon"><Library :size="26" /></span>
        <span v-if="!collapsed" class="nav-label">音乐库</span>
      </button>
    </div>
  </aside>
</template>
