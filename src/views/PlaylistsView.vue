<script setup lang="ts">
import { shallowRef } from "vue";
import { Plus } from "@lucide/vue";
import PlaylistGrid from "../components/PlaylistGrid.vue";
import PlaylistFormDialog from "../components/PlaylistFormDialog.vue";
import EmptyState from "../components/EmptyState.vue";
import SectionHeader from "../components/SectionHeader.vue";
import { usePlayerStore, usePlaylistStore, useUIStore } from "@/stores";

const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();
const uiStore = useUIStore();

// 对话框
const dialogVisible = shallowRef(false);
const dialogMode = shallowRef<"create" | "edit" | "delete">("create");
const editingPlaylistId = shallowRef("");

function openCreateDialog() {
  dialogMode.value = "create";
  editingPlaylistId.value = "";
  dialogVisible.value = true;
}

function openEditDialog(playlistId: string) {
  dialogMode.value = "edit";
  editingPlaylistId.value = playlistId;
  dialogVisible.value = true;
}

function handleDialogConfirm(name?: string) {
  if (dialogMode.value === "create") {
    playlistStore.createPlaylist(name!);
  } else if (dialogMode.value === "edit") {
    playlistStore.updatePlaylist(editingPlaylistId.value, name!);
  } else {
    playlistStore.deletePlaylist(editingPlaylistId.value);
  }
}

// 歌单交互
function enterPlaylist(playlistId: string) {
  playlistStore.selectPlaylist(playlistId);
  uiStore.setActiveView("playlist-detail");
}

function handleDeletePlaylist(playlistId: string) {
  dialogMode.value = "delete";
  editingPlaylistId.value = playlistId;
  dialogVisible.value = true;
}

function handlePlayPlaylist(playlistId: string) {
  playlistStore.updatePlayingPlaylist(playlistId);
  playerStore.setPlaySourceType("playlists");
  playerStore.playTrack(0, true);
}
</script>

<template>
  <section class="main-panel playlist-browser">
    <SectionHeader>
      <template #title>
        <h2>歌单</h2>
      </template>
      <template #right>
        <button
          class="icon-btn"
          type="button"
          title="新建歌单"
          @click="openCreateDialog"
        >
          <Plus :size="20" />
        </button>
      </template>
    </SectionHeader>

    <PlaylistGrid
      v-if="playlistStore.playlists.length"
      :playlists="playlistStore.playlists"
      :selectedPlaylistId="playlistStore.selectedPlaylistId"
      @selectPlaylist="enterPlaylist"
      @playPlaylist="handlePlayPlaylist"
      @editPlaylist="openEditDialog"
      @deletePlaylist="handleDeletePlaylist"
    />
    <EmptyState
      v-else
      title="还没有歌单"
      content="创建一个歌单，开始整理你的音乐。"
    />

    <PlaylistFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial-name="
        dialogMode === 'edit' || dialogMode === 'delete'
          ? (playlistStore.playlists.find((p) => p.id === editingPlaylistId)
              ?.name ?? '')
          : ''
      "
      @confirm="handleDialogConfirm"
    />
  </section>
</template>
