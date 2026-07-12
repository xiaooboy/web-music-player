<script setup lang="ts">
import { computed, shallowReactive, useTemplateRef } from "vue";
import { MoreVertical, Pencil, Play, Trash2 } from "@lucide/vue";
import type { Playlist, Track } from "@/types";
import { useLibraryStore } from "@/stores/libraryStore";
import ContextMenu from "./ContextMenu.vue";
import ActionSheet from "./ActionSheet.vue";
import type { MenuItem, EventPosition } from "./ContextMenu.vue";
import { useMediaQuery } from "../composables/useMediaQuery";

const props = defineProps<{
  playlists: Playlist[];
  selectedPlaylistId?: string;
  transitionTarget?: string;
  viewTransitionName?: string;
}>();

// ─── 事件委托：图片加载完成 ──────────────────────────────────────────────────────
function handleImgLoad(event: Event) {
  const target = event.target as HTMLElement;
  if (target.tagName === "IMG") {
    target.classList.add("is-loaded");
  }
}

const emit = defineEmits<{
  (e: "selectPlaylist", id: string): void;
  (e: "playPlaylist", id: string): void;
  (e: "editPlaylist", id: string): void;
  (e: "deletePlaylist", id: string): void;
}>();

const libraryStore = useLibraryStore();

/** 歌单封面映射：取第一首歌的封面 */
const coverUrlMap = computed(() => {
  const trackMap = new Map(libraryStore.tracks.map((t) => [t.id, t]));
  const map: Record<string, string> = {};
  for (const playlist of props.playlists) {
    const firstTrackId = playlist.trackIds[0];
    const track = firstTrackId ? trackMap.get(firstTrackId) : undefined;
    map[playlist.id] = track?.coverUrl ?? "";
  }
  return map;
});

// ─── 右键菜单 ────────────────────────────────────────────────────────────────
const isSmallScreen = useMediaQuery("(max-width: 640px)");
const contextMenuRef =
  useTemplateRef<InstanceType<typeof ContextMenu>>("contextMenu");
const actionSheetRef =
  useTemplateRef<InstanceType<typeof ActionSheet>>("actionSheet");
const menuProps = shallowReactive({
  title: "",
  menu: [] as MenuItem[],
});

function openMenu(event: MouseEvent, playlist: Playlist) {
  event.stopPropagation();
  menuProps.title = playlist.name;
  menuProps.menu = [
    {
      label: "编辑歌单",
      icon: Pencil,
      action: () => emit("editPlaylist", playlist.id),
    },
    {
      label: "删除歌单",
      icon: Trash2,
      action: () => emit("deletePlaylist", playlist.id),
    },
  ];
  if (isSmallScreen.value) {
    actionSheetRef.value?.open();
  } else {
    contextMenuRef.value?.open(event, () => {});
  }
}

function handleMoreKeydown(event: KeyboardEvent, playlist: Playlist) {
  if (event.key === 'F10' && event.shiftKey) {
    event.preventDefault();
    openMenu(event as unknown as MouseEvent, playlist);
  } else if (event.key === 'ContextMenu') {
    event.preventDefault();
    openMenu(event as unknown as MouseEvent, playlist);
  }
}
</script>

<template>
  <div class="playlist-grid-scroll" @load.capture="handleImgLoad">
    <div class="playlist-grid">
      <section
        v-for="playlist in playlists"
        :key="playlist.id"
        class="playlist-card"
        :class="{
          'is-active': playlist.id === selectedPlaylistId,
        }"
        tabindex="0"
        :aria-label="`${playlist.name}，${playlist.trackIds.length} 首`"
        @click="emit('selectPlaylist', playlist.id)"
        @keydown.enter="emit('selectPlaylist', playlist.id)"
      >
        <div class="playlist-card-cover">
          <img
            v-if="coverUrlMap[playlist.id]"
            class="img-fadein"
            :src="coverUrlMap[playlist.id]"
            :alt="`${playlist.name} 封面`"
            loading="lazy"
          />
          <button
            class="playlist-card-play"
            type="button"
            aria-label="播放歌单"
            @click.stop="emit('playPlaylist', playlist.id)"
            @keydown.enter.stop
          >
            <Play :size="20" />
          </button>
        </div>
        <div class="playlist-card-copy">
          <strong class="playlist-card-title">
            <span
              :style="
                playlist.id === transitionTarget
                  ? { 'view-transition-name': viewTransitionName }
                  : undefined
              "
              >{{ playlist.name }}</span
            >
          </strong>
          <span class="playlist-card-count"
            >{{ playlist.trackIds.length }} 首</span
          >
        </div>
        <button
          class="playlist-card-more"
          type="button"
          aria-label="更多操作"
          aria-haspopup="menu"
          @click="openMenu($event, playlist)"
          @keydown="handleMoreKeydown($event, playlist)"
          @keydown.enter.stop
        >
          <MoreVertical :size="20" />
        </button>
      </section>
    </div>

    <ContextMenu v-if="!isSmallScreen" ref="contextMenu" v-bind="menuProps" />
    <ActionSheet v-else ref="actionSheet" v-bind="menuProps" />
  </div>
</template>
