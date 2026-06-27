<script setup lang="ts">
import { toasts } from "../composables/useToast";

const toastList = toasts;
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div v-for="item in toastList" :key="item.id" class="toast-item">
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
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  padding: 10px 20px;
  border-radius: 8px;
  background: rgba(32, 32, 32, 0.88);
  backdrop-filter: blur(12px);
  color: #fff;
  font-size: 0.9rem;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
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
  opacity: 0;
  transform: translateY(12px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
