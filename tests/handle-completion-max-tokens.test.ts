import { test, expect, mock } from "bun:test"

import type { ChatCompletionsPayload } from "../src/services/copilot/create-chat-completions"
import type { Model } from "../src/services/copilot/get-models"

import { state } from "../src/lib/state"
import { handleCompletion } from "../src/routes/chat-completions/handler"

state.copilotToken = "test-token"
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

const testModel: Model = {
  id: "gpt-5-test",
  model_picker_enabled: true,
  capabilities: {
    family: "gpt-5",
    object: "model_capabilities",
    tokenizer: "o200k_base",
    type: "chat",
    supports: {},
    limits: { max_output_tokens: 4096 },
  },
} as Model

state.models = { object: "list", data: [testModel] }

const fetchMock = mock(
  (_url: string, opts: { headers: Record<string, string>; body: string }) => {
    return {
      ok: true,
      json: () => ({ id: "123", object: "chat.completion", choices: [] }),
      headers: opts.headers,
    }
  },
)
// @ts-expect-error - Mock fetch doesn't implement all fetch properties
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock

function fakeContext(payload: ChatCompletionsPayload) {
  return {
    req: { json: () => Promise.resolve(payload) },
    json: (body: unknown) => body,
  } as unknown as Parameters<typeof handleCompletion>[0]
}

function lastSentBody(): Record<string, unknown> {
  const lastCall = fetchMock.mock.calls.at(-1) as [string, { body: string }]
  return JSON.parse(lastCall[1].body) as Record<string, unknown>
}

test("does not default max_tokens when the client already sent max_completion_tokens", async () => {
  await handleCompletion(
    fakeContext({
      model: "gpt-5-test",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 16,
    }),
  )
  const sent = lastSentBody()
  expect(sent.max_completion_tokens).toBe(16)
  expect(sent.max_tokens).toBeUndefined()
})

test("still defaults max_tokens from model limits when neither field is set", async () => {
  await handleCompletion(
    fakeContext({
      model: "gpt-5-test",
      messages: [{ role: "user", content: "hi" }],
    }),
  )
  const sent = lastSentBody()
  expect(sent.max_tokens).toBe(4096)
  expect(sent.max_completion_tokens).toBeUndefined()
})

test("leaves an explicit max_tokens untouched", async () => {
  await handleCompletion(
    fakeContext({
      model: "gpt-5-test",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 32,
    }),
  )
  const sent = lastSentBody()
  expect(sent.max_tokens).toBe(32)
  expect(sent.max_completion_tokens).toBeUndefined()
})
