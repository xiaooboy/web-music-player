import type { Album, Track } from "@/types";
import { defineStore } from "pinia";
import { computed, shallowRef, watch } from "vue";
import { defaultSort } from "@/utils/sort";
import { useLibraryStore } from "./libraryStore";

export const useAlbumStore = defineStore("album", () => {
  const albumMap = new Map<string, Album>();
  const albums = shallowRef<Album[]>([]);

  const selectedAlbumName = shallowRef("");
  const playingAlbumName = shallowRef("");

  function selectAlbum(albumName: string) {
    const valid = albumMap.has(albumName);
    selectedAlbumName.value = valid ? albumName : "";
  }

  function clearSelection() {
    selectedAlbumName.value = "";
  }

  /** 当前选中的专辑 */
  const selectedAlbum = computed(
    () => albumMap.get(selectedAlbumName.value) ?? null,
  );

  /** 当前播放专辑的曲目列表，供 playerStore 拉取 */
  const currentAlbumTracks = computed(() => {
    const album = albumMap.get(playingAlbumName.value);
    return album ? album.tracks : [];
  });

  /** 根据 tracks 重建 albumMap 和 albums */
  function rebuildAlbumMap(tracks: Track[]) {
    albumMap.clear();
    tracks.forEach((track) => {
      const albumName = track.album.trim() || "未知专辑";
      const artistName = track.artist.trim() || "未知歌手";
      const existingAlbum = albumMap.get(albumName);

      if (existingAlbum) {
        if (!existingAlbum.artistSet.has(artistName)) {
          existingAlbum.artistSet.add(artistName);
          existingAlbum.artistLabel += ` / ${artistName}`;
        }
        existingAlbum.duration += track.duration;
        if (!existingAlbum.coverBlob && track.coverBlob) {
          existingAlbum.coverBlob = track.coverBlob;
        }
        existingAlbum.tracks.push(track);
        return;
      }

      albumMap.set(albumName, {
        name: albumName,
        artistSet: new Set([artistName]),
        artistLabel: artistName,
        duration: track.duration,
        coverBlob: track.coverBlob,
        tracks: [track],
      });
    });
    albums.value = defaultSort([...albumMap.values()], "name");
    if (!albumMap.has(selectedAlbumName.value)) {
      selectedAlbumName.value = "";
    }
    // 校验当前播放专辑是否仍然有效
    if (!albumMap.has(playingAlbumName.value)) {
      playingAlbumName.value = "";
    }
  }

  function updatePlayingAlbum(albumName: string) {
    const valid = albumMap.has(albumName);
    playingAlbumName.value = valid ? albumName : "";
  }

  // ─── 拉模式：watch libraryStore.tracks 自动重建 albumMap ─────────────────
  watch(
    () => useLibraryStore().tracks,
    (newTracks) => rebuildAlbumMap(newTracks),
    { flush: "sync", immediate: true },
  );

  return {
    albums,
    selectedAlbumName,
    selectedAlbum,
    playingAlbumName,
    currentAlbumTracks,
    selectAlbum,
    clearSelection,
    updatePlayingAlbum,
  };
});
