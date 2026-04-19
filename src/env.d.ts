/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_BASE_URL: string
  readonly VITE_LLM_API_KEY: string
  readonly VITE_LLM_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
