<script setup lang="ts">
import { computed, ref } from "vue";
import { FolderPlus, FolderSymlink, Trash2, RefreshCw } from "@lucide/vue";
import { supportsDirectoryPicker } from "../utils/media";
import { openPicker, openWebkitDirectory } from "../utils/folder";
import { useLibraryStore } from "../stores/libraryStore";
import { showToast } from "../composables/useToast";
import EmptyState from "../components/EmptyState.vue";
import SectionHeader from "../components/SectionHeader.vue";
import BaseDialog from "../components/BaseDialog.vue";

const libraryStore = useLibraryStore();

// 根据环境和浏览器支持情况决定是否显示添加按钮
const showAddButton = import.meta.env.DEV ? true : supportsDirectoryPicker();
const showTempButton = import.meta.env.DEV ? true : !supportsDirectoryPicker();

const libraryHint = computed(() =>
  supportsDirectoryPicker()
    ? libraryStore.musicSources.some((source) => source.persistent)
      ? "已支持多个音乐源；缓存目录下次会自动恢复，失效目录会提示重新授权。"
      : "当前浏览器支持目录授权，添加后会把多个音乐源一起缓存。"
    : "当前环境将使用系统目录选择器导入；若要直接目录授权并自动恢复，请在 Chrome 或 Edge 的 localhost / HTTPS 环境打开",
);

const pendingReauthCount = computed(
  () =>
    libraryStore.musicSources.filter((s) => s.persistent && !s.available)
      .length,
);

async function openFolder(type: "picker" | "webkitDirectory") {
  if (libraryStore.isFileLaunch) {
    showToast("本地文件启动，不支持添加音乐源");
    return;
  }
  const nextSource = await (type === "webkitDirectory"
    ? openWebkitDirectory()
    : openPicker({
        id: "music-source",
        mode: "read",
        startIn: "music",
      }));
  if (!nextSource) return;
  libraryStore.addSource(nextSource);
}

// ─── 删除确认对话框 ──────────────────────────────────────────────────────────────
const confirmVisible = ref(false);
const removingSourceId = ref("");
const removingSourceName = ref("");

function requestRemoveSource(sourceId: string) {
  if (libraryStore.isFileLaunch) {
    showToast("本地文件启动，不支持移除");
    return;
  }
  const source = libraryStore.musicSources.find((s) => s.id === sourceId);
  removingSourceId.value = sourceId;
  removingSourceName.value = source?.name ?? "";
  confirmVisible.value = true;
}

function confirmRemove() {
  libraryStore.removeSource(removingSourceId.value);
  confirmVisible.value = false;
}
</script>

<template>
  <section class="main-panel sources-panel">
    <SectionHeader title="音乐源">
      <template #right>
        <div class="sources-actions-inline">
          <button
            v-if="showAddButton"
            class="icon-button"
            type="button"
            title="添加音乐源"
            @click="openFolder('picker')"
          >
            <FolderPlus :size="20" />
          </button>
          <button
            v-if="showTempButton"
            class="icon-button"
            type="button"
            title="导入临时文件夹"
            @click="openFolder('webkitDirectory')"
          >
            <FolderSymlink :size="20" />
          </button>
          <button
            v-if="pendingReauthCount"
            class="icon-button"
            type="button"
            title="重新授权"
            :disabled="libraryStore.isReauthorizing"
            @click="libraryStore.reauthorizeAll()"
          >
            <RefreshCw :size="20" />
          </button>
        </div>
      </template>
    </SectionHeader>

    <p class="sources-hint">{{ libraryHint }}</p>

    <div
      v-if="libraryStore.musicSources.length"
      class="source-list source-list--panel scroll-borrow"
    >
      <div
        v-for="source in libraryStore.musicSources"
        :key="source.id"
        class="source-item"
      >
        <div class="source-copy">
          <strong>{{ source.name }}</strong>
          <span>{{
            source.kind === "file-launch"
              ? "系统打开文件"
              : source.persistent
                ? source.available
                  ? "已缓存"
                  : "待恢复授权"
                : "临时来源"
          }}</span>
        </div>
        <button
          class="source-remove icon-button"
          type="button"
          title="移除"
          @click="requestRemoveSource(source.id)"
        >
          <Trash2 :size="20" />
        </button>
      </div>
    </div>
    <EmptyState
      v-else
      fill
      title="还没有添加音乐源"
      content="添加一个或多个本地文件夹后，播放器会合并生成统一播放列表。"
    />

    <!-- 删除确认对话框 -->
    <BaseDialog
      v-model="confirmVisible"
      class="form-dialog"
    >
      <form method="dialog" @submit.prevent="confirmRemove">
        <h3>移除音乐源</h3>
        <p class="form-dialog-text">
          确定移除「{{ removingSourceName }}」吗？移除后该目录中的歌曲将从播放列表中消失。
        </p>
        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-btn"
            @click="confirmVisible = false"
          >
            取消
          </button>
          <button type="submit" class="dialog-btn dialog-btn--danger">
            移除
          </button>
        </div>
      </form>
    </BaseDialog>
  </section>
</template>
