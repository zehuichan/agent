import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const baseUrl = ref<string>(import.meta.env.VITE_LLM_BASE_URL ?? '')
  const apiKey = ref<string>(import.meta.env.VITE_LLM_API_KEY ?? '')
  const model = ref<string>(import.meta.env.VITE_LLM_MODEL ?? '')

  function setCredentials(patch: { baseUrl?: string; apiKey?: string; model?: string }): void {
    if (patch.baseUrl !== undefined) baseUrl.value = patch.baseUrl
    if (patch.apiKey !== undefined) apiKey.value = patch.apiKey
    if (patch.model !== undefined) model.value = patch.model
  }

  return { baseUrl, apiKey, model, setCredentials }
})
