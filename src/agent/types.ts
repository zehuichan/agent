/**
 * Core wire types. Aligned with OpenAI Chat Completions so any compatible
 * provider (DeepSeek, Ollama via /v1, OpenRouter, ...) can be plugged in
 * by swapping the client impl only.
 *
 * This file MUST stay framework-free: no Vue, no DOM, no Pinia imports.
 * See AGENTS.md §3 — Architecture red line.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: Role
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  /** `arguments` is a JSON string — keep it raw, parse at the call-site. */
  function: { name: string; arguments: string }
}

export interface ToolResult<T = unknown> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

export type TraceEvent =
  | { kind: 'plan'; step: number; ts: number }
  | { kind: 'tool_call'; step: number; ts: number; call: ToolCall }
  | { kind: 'tool_result'; step: number; ts: number; callId: string; result: ToolResult }
  | { kind: 'message'; step: number; ts: number; message: ChatMessage }
  | { kind: 'error'; step: number; ts: number; error: { code: string; message: string } }
