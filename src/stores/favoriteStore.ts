import type { Track } from "@/types";
import { loadLikedTrackIds, saveLikedTrackIds } from "@/utils/persistence";
import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";
import { useLibraryStore } from "./libraryStore";

export const useFavoriteStore = defineStore("favorite", () => {
  const likedTrackIdSet = shallowRef(new Set(loadLikedTrackIds()));

  /** 拉模式：tracks 直接从 libraryStore 拉取 */
  const tracks = computed(() => useLibraryStore().tracks);

  /** 收藏曲目列表，由 tracks 和 likedTrackIdSet 派生 */
  const favoriteTracks = computed(() =>
    tracks.value.filter((track) => likedTrackIdSet.value.has(track.id)),
  );

  function toggleTrackFavorite(trackId: string) {
    const next = new Set(likedTrackIdSet.value);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    likedTrackIdSet.value = next;
    saveLikedTrackIds([...next]);
  }
  return {
    favoriteTracks,
    likedTrackIdSet,
    toggleTrackFavorite,
  };
});
