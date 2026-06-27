import type { Track } from "@/types";
import { loadLikedTrackIds, saveLikedTrackIds } from "@/utils/persistence";
import { defineStore } from "pinia";
import { shallowRef } from "vue";
import { usePlayerStore } from "./playerStore";

export const useFavoriteStore = defineStore("favorite", () => {
  const playerStore = usePlayerStore();

  const tracks = shallowRef<Track[]>([]);
  const likedTrackIdSet = shallowRef(new Set(loadLikedTrackIds()));

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

  function toggleTrackFavorite(trackId: string) {
    const next = new Set(likedTrackIdSet.value);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    likedTrackIdSet.value = next;
    saveLikedTrackIds([...next]);
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
    toggleTrackFavorite,
  };
});
