<script setup lang="ts">
defineProps<{
  title: string;
  status?: string;
}>();
</script>

<template>
  <div class="section-head">
    <div>
      <h2>{{ title }}</h2>
    </div>
    <span v-if="status" class="library-status">{{ status }}</span>
  </div>
</template>
