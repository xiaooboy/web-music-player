<script setup lang="ts">
import { ref, watch } from "vue";
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
      <p v-if="mode === 'delete'" class="form-dialog-text">
        确定删除歌单「{{ initialName }}」吗？
      </p>
      <input
        v-else
        v-model="name"
        type="text"
        aria-label="歌单名称"
        placeholder="歌单名称"
        autofocus
        class="form-dialog-input"
      />
      <div class="dialog-actions">
        <button
          type="button"
          class="dialog-btn"
          @click="visible = false"
        >
          取消
        </button>
        <button
          type="submit"
          class="dialog-btn"
          :class="
            mode === 'delete' ? 'dialog-btn--danger' : 'dialog-btn--primary'
          "
        >
          {{ mode === "create" ? "创建" : mode === "edit" ? "保存" : "删除" }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style>
.form-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(32, 32, 32, 0.95);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.48);
  color: var(--text);
  width: min(360px, calc(100vw - 32px));
  max-height: 80dvh;
  transform-origin: center center;

  /* 关闭态：动画起点 */
  opacity: 0;
  transform: scale(0.92);

  transition:
    opacity 120ms ease-in,
    transform 120ms ease-in,
    overlay 120ms ease-in allow-discrete,
    display 120ms ease-in allow-discrete;
}

/* 打开态 */
.form-dialog[open] {
  opacity: 1;
  transform: scale(1);

  transition:
    opacity 200ms ease-out,
    transform 200ms ease-out,
    overlay 200ms ease-out allow-discrete,
    display 200ms ease-out allow-discrete;

  @starting-style {
    opacity: 0;
    transform: scale(0.92);
  }
}

/* ─── backdrop 动画 ──────────────────────────────────────────────────────── */
.form-dialog::backdrop {
  background: rgba(0, 0, 0, 0);

  transition:
    background 120ms ease-in,
    display 120ms ease-in allow-discrete,
    overlay 120ms ease-in allow-discrete;
}

.form-dialog[open]::backdrop {
  background: rgba(0, 0, 0, 0.5);

  transition:
    background 200ms ease-out,
    display 200ms ease-out allow-discrete,
    overlay 200ms ease-out allow-discrete;

  @starting-style {
    background: rgba(0, 0, 0, 0);
  }
}

/* ─── 内容样式 ────────────────────────────────────────────────────────────── */
.form-dialog h3 {
  margin-bottom: 16px;
  font-size: 1.1rem;
  font-weight: 700;
}

.form-dialog-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-dialog-input:focus {
  border-color: var(--accent);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.dialog-btn {
  padding: 8px 18px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text);
  font-size: 0.9rem;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.dialog-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.dialog-btn--primary {
  background: var(--accent-deep);
  border-color: var(--accent-deep);
  color: #000;
  font-weight: 600;
}

.dialog-btn--primary:hover {
  background: var(--accent-bright);
}

/* ─── 删除确认文本 ─────────────────────────────────────────────────────────── */
.form-dialog-text {
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

.dialog-btn--danger {
  background: rgba(220, 60, 60, 0.85);
  border-color: rgba(220, 60, 60, 0.85);
  color: #fff;
  font-weight: 600;
}

.dialog-btn--danger:hover {
  background: rgba(220, 60, 60, 1);
}
</style>
