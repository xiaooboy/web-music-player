import type { Track } from "@/types";
import { loadLikedTrackIds, saveLikedTrackIds } from "@/utils/persistence";
import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { usePlayerStore } from "./playerStore";

export const useFavoriteStore = defineStore("favorite", () => {
  const playerStore = usePlayerStore();

  const tracks = shallowRef<Track[]>([]);
  const likedTrackIds = shallowRef<string[]>(loadLikedTrackIds());
  const likedTrackIdSet = shallowRef(new Set(likedTrackIds.value));

  const favoriteTracks = shallowRef<Track[]>([]);

  function setFavoriteSources(data: Track[]) {
    tracks.value = data;
    updateFavoriteTracks();
  }

  function updateFavoriteTracks() {
    favoriteTracks.value = tracks.value.filter((track) =>
      likedTrackIdSet.value.has(track.id),
    );
    updatePlayer();
  }

  function getTrackLikedStatus(trackId: string): boolean {
    return likedTrackIdSet.value.has(trackId);
  }

  function toggleTrackFavorite(trackId: string) {
    const next = new Set(likedTrackIdSet.value);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    likedTrackIdSet.value = next;
    likedTrackIds.value = [...next];
    saveLikedTrackIds(likedTrackIds.value);
    updateFavoriteTracks();
  }
  /** 更新  playerStore */
  function updatePlayer() {
    if (playerStore.playSourceType !== "favorites") return;
    playerStore.setPlaylist(favoriteTracks.value);
  }
  return {
    favoriteTracks,
    likedTrackIdSet,
    setFavoriteSources,
    getTrackLikedStatus,
    toggleTrackFavorite,
  };
});
