<script setup lang="ts">
import { useSettingsStore } from '@/stores'

const settings = useSettingsStore()

const phases = [
  { n: 0, name: 'Bootstrap', status: 'done' },
  { n: 1, name: 'Chat UI', status: 'next' },
  { n: 2, name: 'Streaming', status: 'todo' },
  { n: 3, name: 'Tool Calling', status: 'todo' },
  { n: 4, name: 'Agent Loop', status: 'todo' },
  { n: 5, name: 'Memory', status: 'todo' },
  { n: 6, name: 'Providers', status: 'todo' },
  { n: 7, name: '进阶（MCP / Vapor / RAG）', status: 'todo' },
] as const

function dotClass(status: 'done' | 'next' | 'todo'): string {
  if (status === 'done') return 'bg-emerald-400'
  if (status === 'next') return 'bg-amber-400 animate-pulse'
  return 'bg-white/20'
}
</script>

<template>
  <section class="space-y-10">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">在浏览器里手撕一个 AI Agent</h1>
      <p class="mt-3 text-white/60 leading-relaxed">
        不套壳框架（LangChain / Vercel AI SDK），核心只靠
        <code class="text-accent">fetch</code> +
        <code class="text-accent">ReadableStream</code> + 类型。
      </p>
    </div>

    <div class="rounded-[var(--radius-card)] border border-white/10 p-6">
      <h2 class="text-sm font-semibold text-white/70 uppercase tracking-wider">Roadmap</h2>
      <ul class="mt-4 space-y-2.5">
        <li v-for="p in phases" :key="p.n" class="flex items-center gap-3 text-sm">
          <span class="h-2 w-2 rounded-full" :class="dotClass(p.status)" />
          <span class="w-16 font-mono text-white/40">Phase {{ p.n }}</span>
          <span>{{ p.name }}</span>
        </li>
      </ul>
    </div>

    <div class="rounded-[var(--radius-card)] border border-white/10 p-6">
      <h2 class="text-sm font-semibold text-white/70 uppercase tracking-wider">
        LLM 配置（从环境变量读取）
      </h2>
      <dl class="mt-4 space-y-2 text-sm">
        <div class="flex gap-3">
          <dt class="w-28 text-white/40">Base URL</dt>
          <dd class="font-mono text-white/80">{{ settings.baseUrl || '（未配置）' }}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-28 text-white/40">Model</dt>
          <dd class="font-mono text-white/80">{{ settings.model || '（未配置）' }}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-28 text-white/40">API Key</dt>
          <dd class="font-mono text-white/80">
            {{ settings.apiKey ? '••••••••' : '（未配置）' }}
          </dd>
        </div>
      </dl>
      <p class="mt-4 text-xs text-white/40">
        复制 <code>.env.example</code> 为 <code>.env.local</code> 并填入。
      </p>
    </div>
  </section>
</template>
