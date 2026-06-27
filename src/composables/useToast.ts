import { shallowRef } from "vue";

export interface ToastItem {
  id: number;
  message: string;
}

let nextId = 0;
const toasts = shallowRef<ToastItem[]>([]);

function show(message: string, duration = 2500) {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, duration);
}

export { toasts, show as showToast };
