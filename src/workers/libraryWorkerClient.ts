import type { RuntimeMusicSource, Track, TrackRecord } from "@/types";
import type { LibraryWorkerRequest, LibraryWorkerResponse } from "./protocol";

export interface BuildHandlers {
  onProgress: (info: { done: number; total: number }) => void;
  onResult: (tracks: Track[]) => void;
  onError: (message: string) => void;
}

class LibraryWorkerClient {
  private worker: Worker | null = null;
  private nextToken = 0;
  private activeToken = -1;
  private handlers = new Map<number, BuildHandlers>();

  startBuild(
    sources: RuntimeMusicSource[],
    cachedTracks: TrackRecord[],
    handlers: BuildHandlers,
  ): number {
    // 新 build 启动即作废旧 build 的回调；worker 端靠 token 变化自动中断旧任务
    if (this.activeToken >= 0) {
      this.handlers.delete(this.activeToken);
    }

    const worker = this.ensureWorker();
    const token = ++this.nextToken;
    this.activeToken = token;
    this.handlers.set(token, handlers);

    worker.postMessage({
      type: "build",
      token,
      sources,
      cachedTracks,
    } satisfies LibraryWorkerRequest);

    return token;
  }

  cancelActive(): void {
    if (this.activeToken < 0) return;
    const token = this.activeToken;
    this.activeToken = -1;
    this.handlers.delete(token);
    this.worker?.postMessage({
      type: "cancel",
      token,
    } satisfies LibraryWorkerRequest);
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./library.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event: MessageEvent<LibraryWorkerResponse>) => {
        this.onMessage(event.data);
      };
    }
    return this.worker;
  }

  private onMessage(message: LibraryWorkerResponse): void {
    const handlers = this.handlers.get(message.token);
    if (!handlers) return; // 过期 token，忽略

    if (message.type === "progress") {
      handlers.onProgress({ done: message.done, total: message.total });
      return;
    }

    this.handlers.delete(message.token);
    if (message.token === this.activeToken) {
      this.activeToken = -1;
    }

    if (message.type === "result") {
      handlers.onResult(message.tracks);
    } else {
      handlers.onError(message.message);
    }
  }
}

export const libraryWorker = new LibraryWorkerClient();
