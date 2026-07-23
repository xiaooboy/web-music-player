<script setup lang="ts">
import { toasts } from "../composables/useToast";

const toastList = toasts;
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" role="status" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast">
        <div v-for="item in toastList" :key="item.id" class="toast-container__item">
          {{ item.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 80px;
  left: 50%;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: none;
}

.toast-container__item {
  padding: 10px 20px;
  font-size: 0.9rem;
  color: #fff;
  white-space: nowrap;
  background: rgba(32, 32, 32, 0.9);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(12px);
}

.toast-enter-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.toast-enter-from {
  transform: translateY(12px);
  opacity: 0;
}

.toast-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}
</style>
