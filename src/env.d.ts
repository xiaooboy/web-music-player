/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface LaunchParams {
  files: FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void | Promise<void>): void;
}

declare global {
  interface Window {
    launchQueue?: LaunchQueue;
  }

  /** Injected by Vite: true when started with `--mode tauri` (pnpm dev:tauri / build:tauri). */
  const __IS_TAURI__: boolean;
}

export {};
