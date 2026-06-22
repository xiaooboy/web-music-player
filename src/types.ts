/**
 * 文件获取入口
 */
export interface FileEntry {
  file: File;
  relativePath: string;
}
export type TrackMap = Map<string, Track>;
export interface Track {
  id: string;
  file: File;
  lastModified: number;
  relativePath: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  coverBlob?: Blob;
  duration: number;
  format: string;
  lyricsText: string;
  isPlayable: boolean;
}

export interface LyricsLine {
  time: number | null;
  text: string;
}

export interface MusicSource {
  id: string;
  name: string;
  persistent: boolean;
  available: boolean;
  kind: "directory" | "file-launch";
}
export type RuntimeMusicSource = MusicSource & {
  handle?: FileSystemDirectoryHandle;
  entries?: FileEntry[];
};

export type PlaybackMode = "list" | "one" | "shuffle";
export type PlaybackModeLabel = "列表播放" | "单曲播放" | "随机播放";

export interface Album {
  name: string;
  artistSet: Set<string>;
  artistLabel: string;
  duration: number;
  coverUrl: string;
  tracks: Track[];
}
