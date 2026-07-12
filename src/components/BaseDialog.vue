<script setup lang="ts">
import { useTemplateRef, watch } from "vue";

const open = defineModel<boolean>();

const dialogRef = useTemplateRef("dialogRef");

watch(open, (val) => {
  const el = dialogRef.value;
  if (!el) return;
  if (val && !el.open) {
    el.showModal();
  } else if (!val && el.open) {
    el.close();
  }
});

/** 点击 backdrop（dialog 自身）关闭 */
function handleClick(event: MouseEvent) {
  if (event.target === dialogRef.value) {
    open.value = false;
  }
}

/** dialog.close() 触发后同步状态 */
function handleClose() {
  if (open.value) {
    open.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    @click="handleClick"
    @close="handleClose"
  >
    <slot />
  </dialog>
</template>
