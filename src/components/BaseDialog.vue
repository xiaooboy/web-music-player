<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";
import { isSupported } from "@/utils/dialog-closedby-polyfill"
const open = defineModel<boolean>();

const dialogRef = useTemplateRef("dialogRef");
const supportsClosedBy = isSupported()
/** 同步dialog状态 */
function syncDialogState(){
  console.log('watch')
  const el = dialogRef.value;
  if (!el) return;
  if (open.value && !el.open) {
    el.showModal();
  } else if (!open.value && el.open) {
    el.close();
  }
}

watch(open, syncDialogState);
onMounted(syncDialogState)
/** 点击 backdrop（dialog 自身）关闭 */
function handleClick(event: MouseEvent) {
  // 检查closedby支持
  if (!dialogRef.value?.hasAttribute("closedby")) return;

  if (event.target === dialogRef.value) {
    open.value = false;
  }
}

/** dialog.close() 触发后同步状态 */
function handleClose() {
  if(supportsClosedBy) return;
  if (open.value) {
    open.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="base-dialog"
    closedby="any"
    @click="handleClick"
    @close="handleClose"
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
  transform: scale(0.92);
  transform-origin: center center;
  transition:
    opacity 200ms ease-in-out,
    transform 200ms ease-in-out,
    overlay 200ms ease-in-out allow-discrete,
    display 200ms ease-in-out allow-discrete;

  /* 关闭态：动画起点 */
  opacity: 0;
}
/* 打开态 */
.base-dialog[open] {
  transform: scale(1);
  opacity: 1;
  @starting-style {
    transform: scale(0.92);
    opacity: 0;
  }
}

/* backdrop 动画 */
.base-dialog::backdrop {
  background: rgba(0, 0, 0, 0);
  transition:
    background 120ms ease-in,
    display 120ms ease-in allow-discrete,
    overlay 120ms ease-in allow-discrete;
}

.base-dialog[open]::backdrop {
  background: rgba(0, 0, 0, 0.5);
  transition:
    background 250ms ease-out,
    display 250ms ease-out allow-discrete,
    overlay 250ms ease-out allow-discrete;

  @starting-style {
    background: rgba(0, 0, 0, 0);
  }
}
</style>
