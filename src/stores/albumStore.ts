import type { Album, Track } from "@/types";
import { defineStore } from "pinia";
import { shallowRef } from "vue";
import { usePlayerStore } from "./playerStore";
import { defaultSort } from "@/utils/sort";

export const useAlbumStore = defineStore("album", () => {
  const playerStore = usePlayerStore();

  const albumMap = new Map<string, Album>();
  const albums = shallowRef<Album[]>([]);

  const selectedAlbumName = shallowRef("");
  const playingAlbumName = shallowRef("");

  function selectAlbum(albumName: string) {
    const valid = albumMap.has(albumName);
    selectedAlbumName.value = valid ? albumName : "";
  }

  function getPlayingAlbum() {
    return albumMap.get(playingAlbumName.value);
  }

  function updateAlbumWithTracks(tracks: Track[]) {
    albumMap.clear();
    tracks.forEach((track, index) => {
      const albumName = track.album.trim() || "未知专辑";
      const artistName = track.artist.trim() || "未知歌手";
      const existingAlbum = albumMap.get(albumName);

      if (existingAlbum) {
        if (!existingAlbum.artistSet.has(artistName)) {
          existingAlbum.artistSet.add(artistName);
          existingAlbum.artistLabel += ` / ${artistName}`;
        }
        existingAlbum.duration += track.duration;
        if (!existingAlbum.coverUrl && track.coverUrl) {
          existingAlbum.coverUrl = track.coverUrl;
        }
        existingAlbum.tracks.push(track);
        return;
      }

      albumMap.set(albumName, {
        name: albumName,
        artistSet: new Set([artistName]),
        artistLabel: artistName,
        duration: track.duration,
        coverUrl: track.coverUrl,
        tracks: [track],
      });
    });
    albums.value = defaultSort(albums.value, "name");
    if (!selectedAlbumName.value) {
      selectAlbum(albums.value[0].name);
    }
    updatePlayingAlbum(playingAlbumName.value);
  }

  function updatePlayingAlbum(albumName: string) {
    const valid = albumMap.has(albumName);
    playingAlbumName.value = valid ? albumName : "";
    if (playerStore.playSourceType === "albums") {
      playerStore.setPlaylist(getPlayingAlbum().tracks);
    }
  }

  return {
    albums,
    selectedAlbumName,
    playingAlbumName,
    updateAlbumWithTracks,
    getPlayingAlbum,
    selectAlbum,
    updatePlayingAlbum,
  };
});
