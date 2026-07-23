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
.form-dialog {
  position: fixed;
  inset: 0;
  width: min(360px, calc(100vw - 32px));
  max-height: 80dvh;
  margin: auto;
  padding: 24px;
  color: var(--text);
  background: rgba(32, 32, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(12px);
  transform: scale(0.92);
  transform-origin: center center;

  transition:
    opacity 120ms ease-in,
    transform 120ms ease-in,
    overlay 120ms ease-in allow-discrete,
    display 120ms ease-in allow-discrete;

  /* 关闭态：动画起点 */
  opacity: 0;
}

/* 打开态 */
.form-dialog[open] {
  transform: scale(1);

  transition:
    opacity 200ms ease-out,
    transform 200ms ease-out,
    overlay 200ms ease-out allow-discrete,
    display 200ms ease-out allow-discrete;
  opacity: 1;

  @starting-style {
    transform: scale(0.92);
    opacity: 0;
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

.form-dialog__input {
  width: 100%;
  padding: 10px 14px;
  font-size: 0.95rem;
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
  font-size: 0.9rem;
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

/* ─── 删除确认文本 ─────────────────────────────────────────────────────────── */
.form-dialog__text {
  font-size: 0.95rem;
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
