<script setup lang="ts">
import { computed, nextTick, shallowRef } from "vue";
import { Plus } from "@lucide/vue";
import PlaylistGrid from "../components/PlaylistGrid.vue";
import PlaylistDetail from "../components/PlaylistDetail.vue";
import PlaylistDialog from "../components/PlaylistDialog.vue";
import TipContent from "../components/TipContent.vue";
import SectionHead from "../components/SectionHead.vue";
import { usePlayerStore, usePlaylistStore } from "@/stores";
import { withViewTransition } from "@/utils/viewTransition";

const VIEW_TRANSITION_NAME = "playlist-name";
const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();

const showDetail = computed(() => !!playlistStore.selectedPlaylistId);

const detailViewTransitionName = shallowRef("");
const gridViewTransitionName = shallowRef("");
const transitionTarget = shallowRef("");

// ─── 对话框 ──────────────────────────────────────────────────────────────────
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

// ─── 歌单交互 ────────────────────────────────────────────────────────────────
function enterPlaylist(playlistId: string) {
  transitionTarget.value = playlistId;
  gridViewTransitionName.value = VIEW_TRANSITION_NAME;
  nextTick(async () => {
    const { transition } = withViewTransition(() => {
      gridViewTransitionName.value = ""; // 不能同时出现同名的元素
      detailViewTransitionName.value = VIEW_TRANSITION_NAME;
      playlistStore.selectPlaylist(playlistId);
    });
    if (!transition) return;
    await transition.finished;
    detailViewTransitionName.value = "";
    transitionTarget.value = "";
  });
}

async function handleBack() {
  detailViewTransitionName.value = VIEW_TRANSITION_NAME;
  nextTick(async () => {
    const { transition } = withViewTransition(() => {
      detailViewTransitionName.value = ""; // 不能同时出现同名的元素
      transitionTarget.value = playlistStore.selectedPlaylistId ?? "";
      gridViewTransitionName.value = VIEW_TRANSITION_NAME;
      playlistStore.clearSelection();
    });
    if (!transition) return;
    await transition.finished;
    gridViewTransitionName.value = "";
    transitionTarget.value = "";
  });
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
    <SectionHead :style="{ opacity: showDetail ? 0 : 1 }">
      <template #title>
        <h2>歌单</h2>
      </template>
      <template #right>
        <button
          class="playlist-create-btn"
          type="button"
          title="新建歌单"
          @click="openCreateDialog"
        >
          <Plus :size="18" />
        </button>
      </template>
    </SectionHead>

    <PlaylistGrid
      v-if="playlistStore.playlists.length"
      :playlists="playlistStore.playlists"
      :selectedPlaylistId="playlistStore.selectedPlaylistId"
      :viewTransitionName="gridViewTransitionName"
      :transitionTarget="transitionTarget"
      @selectPlaylist="enterPlaylist"
      @playPlaylist="handlePlayPlaylist"
      @editPlaylist="openEditDialog"
      @deletePlaylist="handleDeletePlaylist"
      :style="{
        opacity: showDetail ? 0 : 1,
      }"
    />
    <TipContent
      v-else
      title="还没有歌单"
      content="创建一个歌单，开始整理你的音乐。"
      fill
    />

    <PlaylistDetail
      v-if="showDetail && playlistStore.selectedPlaylist"
      :playlist="playlistStore.selectedPlaylist"
      :tracks="playlistStore.selectedPlaylistTracks"
      :playingTrackId="playerStore.isPlaying ? playerStore.currentTrackId : ''"
      :viewTransitionName="detailViewTransitionName"
      :style="{
        position: 'absolute',
        inset: 0,
      }"
      @back="handleBack"
    />

    <PlaylistDialog
      v-model:visible="dialogVisible"
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
