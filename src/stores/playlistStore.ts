import type { Playlist, Track } from "@/types";
import { loadPlaylists, savePlaylists } from "@/utils/persistence";
import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";
import { useLibraryStore } from "./libraryStore";

export const usePlaylistStore = defineStore("playlist", () => {
  const playlists = shallowRef<Playlist[]>(loadPlaylists());
  const selectedPlaylistId = shallowRef("");
  const playingPlaylistId = shallowRef("");

  /** 当前选中的歌单对象 */
  const selectedPlaylist = computed(
    () => playlists.value.find((p) => p.id === selectedPlaylistId.value) ?? null,
  );

  /** 当前选中歌单的歌曲列表（从 libraryStore 拉取） */
  const selectedPlaylistTracks = computed(() => {
    const playlist = selectedPlaylist.value;
    if (!playlist) return [];
    const trackMap = new Map(
      useLibraryStore().tracks.map((t) => [t.id, t]),
    );
    return playlist.trackIds
      .map((id) => trackMap.get(id))
      .filter(Boolean) as Track[];
  });

  /** 当前播放歌单的曲目列表，供 playerStore 拉取 */
  const currentPlaylistTracks = computed(() => {
    const playlist = playlists.value.find(
      (p) => p.id === playingPlaylistId.value,
    );
    if (!playlist) return [];
    const trackMap = new Map(
      useLibraryStore().tracks.map((t) => [t.id, t]),
    );
    return playlist.trackIds
      .map((id) => trackMap.get(id))
      .filter(Boolean) as Track[];
  });

  function _save() {
    savePlaylists(playlists.value);
  }

  function createPlaylist(name: string): Playlist {
    const now = Date.now();
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name,
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    };
    playlists.value = [...playlists.value, playlist];
    _save();
    return playlist;
  }

  function updatePlaylist(id: string, name: string) {
    const idx = playlists.value.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const updated = { ...playlists.value[idx], name, updatedAt: Date.now() };
    playlists.value = playlists.value.with(idx, updated);
    _save();
  }

  function deletePlaylist(id: string) {
    playlists.value = playlists.value.filter((p) => p.id !== id);
    if (selectedPlaylistId.value === id) selectedPlaylistId.value = "";
    if (playingPlaylistId.value === id) playingPlaylistId.value = "";
    _save();
  }

  function addTrackToPlaylist(playlistId: string, trackId: string) {
    const idx = playlists.value.findIndex((p) => p.id === playlistId);
    if (idx === -1) return;
    const playlist = playlists.value[idx];
    if (playlist.trackIds.includes(trackId)) return;
    const updated = {
      ...playlist,
      trackIds: [...playlist.trackIds, trackId],
      updatedAt: Date.now(),
    };
    playlists.value = playlists.value.with(idx, updated);
    _save();
  }

  function removeTrackFromPlaylist(playlistId: string, trackId: string) {
    const idx = playlists.value.findIndex((p) => p.id === playlistId);
    if (idx === -1) return;
    const playlist = playlists.value[idx];
    const updated = {
      ...playlist,
      trackIds: playlist.trackIds.filter((id) => id !== trackId),
      updatedAt: Date.now(),
    };
    playlists.value = playlists.value.with(idx, updated);
    _save();
  }

  function selectPlaylist(id: string) {
    const valid = playlists.value.some((p) => p.id === id);
    selectedPlaylistId.value = valid ? id : "";
  }

  function clearSelection() {
    selectedPlaylistId.value = "";
  }

  function updatePlayingPlaylist(id: string) {
    const valid = playlists.value.some((p) => p.id === id);
    playingPlaylistId.value = valid ? id : "";
  }

  return {
    playlists,
    selectedPlaylistId,
    selectedPlaylist,
    selectedPlaylistTracks,
    playingPlaylistId,
    currentPlaylistTracks,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    selectPlaylist,
    clearSelection,
    updatePlayingPlaylist,
  };
});
