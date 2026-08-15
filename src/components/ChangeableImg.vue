<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  width?: number | string;
  height?: number | string;
  src: string;
  alt?: string;
}>(), {
  width: undefined,
  height: undefined,
});
const width = computed(() => getSize(props.width));
const height = computed(() => getSize(props.height));
const getSize = (size: number | string | undefined): string => {
  if (size === undefined) return "auto";
  if (typeof size === "number") return `${size}px`;
  return size;
};
</script>
<template>
  <div class="changeable-img" :style="{ width, height }">
    <Transition name="opacity-fade" appear>
      <img class="changeable-img__img" :key="src" :src="src" :alt="alt" />
    </Transition>
  </div>
</template>
<style scoped>
.changeable-img {
  position: relative;
}
.changeable-img__img {
  width: 100%;
  height: 100%;
}
</style>
