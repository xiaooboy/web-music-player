<script setup lang="ts">
import { Disc3, Heart, Library, ListMusic, Music3 } from "lucide-vue-next";

defineProps<{
  activeSection: "playlist" | "favorites" | "albums" | "library-management";
}>();

defineEmits<{
  switchSection: [
    section: "playlist" | "favorites" | "albums" | "library-management",
  ];
}>();
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <Music3 :size="32" />
      </div>
    </div>

    <div class="nav-panel">
      <button
        class="nav-item"
        title="播放列表"
        :class="{ 'is-active': activeSection === 'playlist' }"
        type="button"
        @click="$emit('switchSection', 'playlist')"
      >
        <span class="nav-icon"><ListMusic :size="26" /></span>
      </button>
      <button
        class="nav-item"
        title="收藏"
        :class="{ 'is-active': activeSection === 'favorites' }"
        type="button"
        @click="$emit('switchSection', 'favorites')"
      >
        <span class="nav-icon"><Heart :size="26" /></span>
      </button>
      <button
        class="nav-item"
        title="专辑"
        :class="{ 'is-active': activeSection === 'albums' }"
        type="button"
        @click="$emit('switchSection', 'albums')"
      >
        <span class="nav-icon"><Disc3 :size="26" /></span>
      </button>
      <button
        class="nav-item"
        title="音乐库管理"
        :class="{ 'is-active': activeSection === 'library-management' }"
        type="button"
        @click="$emit('switchSection', 'library-management')"
      >
        <span class="nav-icon"><Library :size="26" /></span>
      </button>
    </div>
  </aside>
</template>
