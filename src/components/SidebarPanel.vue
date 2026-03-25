<script setup lang="ts">
import { Disc3, Heart, Library, ListMusic, Music3 } from "lucide-vue-next";

defineProps<{
  activeSection: "playlist" | "favorites" | "albums" | "library-management";
}>();

defineEmits<{
  switchSection: [section: "playlist" | "favorites" | "albums" | "library-management"];
}>();
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <Music3 :size="24" />
      </div>
      <div class="brand-copy">
        <strong>LocalMusic</strong>
      </div>
    </div>

    <div class="nav-panel">
      <button
        class="nav-item"
        :class="{ 'is-active': activeSection === 'playlist' }"
        type="button"
        @click="$emit('switchSection', 'playlist')"
      >
        <span class="nav-icon"><ListMusic :size="18" /></span>
        <div>
          <strong>播放列表</strong>
        </div>
      </button>
      <button
        class="nav-item"
        :class="{ 'is-active': activeSection === 'favorites' }"
        type="button"
        @click="$emit('switchSection', 'favorites')"
      >
        <span class="nav-icon"><Heart :size="18" /></span>
        <div>
          <strong>喜欢</strong>
        </div>
      </button>
      <button
        class="nav-item"
        :class="{ 'is-active': activeSection === 'albums' }"
        type="button"
        @click="$emit('switchSection', 'albums')"
      >
        <span class="nav-icon"><Disc3 :size="18" /></span>
        <div>
          <strong>专辑</strong>
        </div>
      </button>
      <button
        class="nav-item"
        :class="{ 'is-active': activeSection === 'library-management' }"
        type="button"
        @click="$emit('switchSection', 'library-management')"
      >
        <span class="nav-icon"><Library :size="18" /></span>
        <div>
          <strong>音乐库管理</strong>
        </div>
      </button>
    </div>
  </aside>
</template>
