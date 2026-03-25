export interface FileEntry {
  file: File;
  relativePath: string;
}

export interface Track {
  id: string;
  file: File;
  relativePath: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
  format: string;
  lyricsText: string;
  isPlayable: boolean;
}

export type RepeatMode = "one" | "off";

export interface LyricsLine {
  time: number | null;
  text: string;
}

export interface MusicSource {
  id: string;
  name: string;
  persistent: boolean;
  available: boolean;
}
