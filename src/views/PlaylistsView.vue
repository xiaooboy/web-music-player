<script setup lang="ts">
import { shallowRef, useTemplateRef, nextTick } from "vue";
import { MoreVertical, Plus, Upload } from "@lucide/vue";
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

// 导出歌单
function handleExportPlaylist(playlistId: string) {
  const playlist = playlistStore.playlists.find((p) => p.id === playlistId);
  if (!playlist) return;

  const content = playlist.trackIds.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${playlist.name}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 导入歌单
function handleImportPlaylist() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    // 从文件名提取歌单名（去掉 .txt 后缀）
    const playlistName = file.name.replace(/\.txt$/i, "");

    const text = await file.text();
    const trackIds = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    playlistStore.createPlaylist(playlistName, trackIds);
  };
  input.click();
}

// 右上角更多 Popover
const headerPopoverRef = useTemplateRef("headerPopoverRef");
const popoverStyle = shallowRef<Record<string, string>>({});

function handleHeaderPopoverAction(action: () => void) {
  headerPopoverRef.value?.hidePopover();
  action();
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
          ref="headerMoreRef"
          class="icon-btn playlist-browser__more-btn"
          type="button"
          title="更多操作"
          popovertarget="playlistsHeaderPopover"
        >
          <MoreVertical :size="20" />
        </button>
      </template>
    </SectionHeader>
    <div
      ref="headerPopoverRef"
      id="playlistsHeaderPopover"
      class="header-popover"
      popover="auto"
      :style="popoverStyle"
      @click.stop
    >
      <button
        class="header-popover__item"
        type="button"
        @click="handleHeaderPopoverAction(openCreateDialog)"
      >
        <Plus :size="18" class="header-popover__icon" />
        <span>新建歌单</span>
      </button>
      <button
        class="header-popover__item"
        type="button"
        @click="handleHeaderPopoverAction(handleImportPlaylist)"
      >
        <Upload :size="18" class="header-popover__icon" />
        <span>导入歌单</span>
      </button>
    </div>
    <PlaylistGrid
      v-if="playlistStore.playlists.length"
      :playlists="playlistStore.playlists"
      :selectedPlaylistId="playlistStore.selectedPlaylistId"
      @selectPlaylist="enterPlaylist"
      @playPlaylist="handlePlayPlaylist"
      @editPlaylist="openEditDialog"
      @deletePlaylist="handleDeletePlaylist"
      @exportPlaylist="handleExportPlaylist"
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

<style>
.playlist-browser__more-btn {
  anchor-name: --more-btn;
}
.header-popover {
  position: fixed;
  inset: auto;
  top: calc(anchor(bottom) + 10px);
  right: calc(anchor(right) + 10px);
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 4px;
  position-anchor: --more-btn;
}

.header-popover__item {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 14px;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--text);
  text-align: left;
  background: transparent;
  border-radius: 8px;
  transition: background 0.15s ease;
  cursor: pointer;
}

.header-popover__item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.header-popover__icon {
  display: inline-flex;
  flex-shrink: 0;
}
</style>
