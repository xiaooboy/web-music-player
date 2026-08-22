<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";
const visible = defineModel<boolean>();

const dialogRef = useTemplateRef("dialogRef");
/** 同步dialog状态 */
function syncDialogState() {
  const el = dialogRef.value;
  if (!el) return;
  if (visible.value && !el.open) {
    el.showModal();
  } else if (!visible.value && el.open) {
    el.close();
  }
}

/** dialog.close() 触发后同步状态 */
function handleClose() {
  if (visible.value) visible.value = false;
}
function open(){
  visible.value = true
}
function close(){
  visible.value = false
}
/** 状态切换后进行一次数据同步 */
function handleToggle(event: ToggleEvent) {
  visible.value = event.newState === "open";
}
watch(visible, syncDialogState);
onMounted(syncDialogState);


defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialogRef"
    class="base-dialog"
    closedby="any"
    @close="handleClose"
    @toggle="handleToggle"
  >
    <slot />
  </dialog>
</template>
<style>
.base-dialog {
  width: min(360px, calc(100vw - 32px));
  padding: 24px;
  color: var(--text);
  background: rgba(32, 32, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(12px);
  transform: scale(0.95) translateY(20px);
  transform-origin: center center;
  transition:
    opacity 250ms ease-in-out,
    transform 250ms ease-in-out,
    overlay 250ms ease-in-out allow-discrete,
    display 250ms ease-in-out allow-discrete;

  /* 关闭态：动画起点 */
  opacity: 0;
}
/* 打开态 */
.base-dialog[open] {
  transform: scale(1) translateY(0);
  opacity: 1;
  @starting-style {
    transform: scale(0.95) translateY(20px);
    opacity: 0;
  }
}

/* backdrop 动画 */
.base-dialog::backdrop {
  background: transparent;
  transition:
    background 250ms ease-in,
    display 250ms ease-in allow-discrete,
    overlay 250ms ease-in allow-discrete;
}

.base-dialog[open]::backdrop {
  background: rgba(0, 0, 0, 0.5);
  @starting-style {
    background: transparent;
  }
}
</style>
