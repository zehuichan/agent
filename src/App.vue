<script setup lang="ts">
import { RouterView } from 'vue-router'
import { AppHeader } from '@/components/ui'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <RouterView />
    </main>
  </div>
</template>
