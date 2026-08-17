<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import BaseDialog from "./BaseDialog.vue";

const visible = defineModel<boolean>();

const props = defineProps<{
  mode: "create" | "edit" | "delete";
  initialName?: string;
}>();

const emit = defineEmits<{
  confirm: [name?: string];
}>();

const name = ref(props.initialName ?? "");

watch(
  () => props.initialName,
  (val) => {
    name.value = val ?? "";
  },
);

function handleConfirm() {
  if (props.mode === "delete") {
    emit("confirm");
  } else {
    const trimmed = name.value.trim();
    if (!trimmed) return;
    emit("confirm", trimmed);
  }
  visible.value = false;
}

/** 拦截输入框 Enter 键，避免焦点转移到外部触发按钮 */
async function handleKeydown(e: KeyboardEvent) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  handleConfirm();
  await nextTick();
  (document.activeElement as HTMLElement)?.blur();
}
</script>

<template>
  <BaseDialog
    v-model="visible"
    class="form-dialog"
  >
    <form method="dialog" @submit.prevent="handleConfirm">
      <h3>
        {{
          mode === "create"
            ? "新建歌单"
            : mode === "edit"
              ? "编辑歌单"
              : "删除歌单"
        }}
      </h3>
      <p v-if="mode === 'delete'" class="form-dialog__text">
        确定删除歌单「{{ initialName }}」吗？
      </p>
      <input
        v-else
        v-model="name"
        type="text"
        aria-label="歌单名称"
        placeholder="歌单名称"
        autofocus
        class="form-dialog__input"
        @keydown="handleKeydown"
      />
      <div class="form-dialog__actions">
        <button
          type="button"
          class="form-dialog__btn"
          @click="visible = false"
        >
          取消
        </button>
        <button
          type="submit"
          class="form-dialog__btn"
          :class="
            mode === 'delete' ? 'form-dialog__btn--danger' : 'form-dialog__btn--primary'
          "
        >
          {{ mode === "create" ? "创建" : mode === "edit" ? "保存" : "删除" }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style>
/* 内容样式 */
.form-dialog h3 {
  margin-bottom: 16px;
  font-size: var(--text-lg);
  font-weight: 700;
}

.form-dialog__input {
  width: 100%;
  padding: 10px 14px;
  font-size: var(--text-sm);
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-dialog__input:focus {
  border-color: var(--accent);
}

.form-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 18px;
}

.form-dialog__btn {
  padding: 8px 18px;
  font-size: var(--text-sm);
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  cursor: pointer;
}

.form-dialog__btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.form-dialog__btn--primary {
  font-weight: 600;
  color: #000;
  background: var(--accent-deep);
  border-color: var(--accent-deep);
}

.form-dialog__btn--primary:hover {
  background: var(--accent-bright);
}

/* 删除确认文本 */
.form-dialog__text {
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--muted);
}

.form-dialog__btn--danger {
  font-weight: 600;
  color: #fff;
  background: rgba(220, 60, 60, 0.85);
  border-color: rgba(220, 60, 60, 0.85);
}

.form-dialog__btn--danger:hover {
  background: rgba(220, 60, 60, 1);
}
</style>
