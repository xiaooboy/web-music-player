import type { Playlist, Track } from "@/types";
import { loadPlaylists, savePlaylists } from "@/utils/persistence";
import { defaultStringCompare } from "@/utils/sort";
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
    const { trackMap } = useLibraryStore();
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
    const { trackMap } = useLibraryStore();
    return playlist.trackIds
      .map((id) => trackMap.get(id))
      .filter(Boolean) as Track[];
  });

  function _save() {
    savePlaylists(playlists.value);
  }

  /** 在已按标题升序排列的 trackIds 中，找到新曲目的插入位置 */
  function findInsertIndex(
    trackIds: string[],
    newTrack: Track,
    trackMap: Map<string, Track>,
  ): number {
    let lo = 0;
    let hi = trackIds.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const existing = trackMap.get(trackIds[mid]);
      if (
        existing &&
        defaultStringCompare(existing.title, newTrack.title) < 0
      ) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /** 按标题排序 trackIds */
  function sortTrackIdsByTitle(trackIds: string[]): string[] {
    const { trackMap } = useLibraryStore();
    return trackIds.toSorted((a, b) => {
      const ta = trackMap.get(a);
      const tb = trackMap.get(b);
      if (!ta) return 1;
      if (!tb) return -1;
      return defaultStringCompare(ta.title, tb.title);
    });
  }

  function createPlaylist(name: string, trackIds?: string[]): Playlist {
    const now = Date.now();
    const sortedIds = trackIds?.length
      ? sortTrackIdsByTitle(trackIds)
      : [];
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name,
      trackIds: sortedIds,
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

    // 按标题二分插入，保持歌单内歌曲有序
    const { trackMap } = useLibraryStore();
    const newTrack = trackMap.get(trackId);
    const insertPos = newTrack
      ? findInsertIndex(playlist.trackIds, newTrack, trackMap)
      : playlist.trackIds.length;

    const updated = {
      ...playlist,
      trackIds: playlist.trackIds.toSpliced(insertPos, 0, trackId),
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
