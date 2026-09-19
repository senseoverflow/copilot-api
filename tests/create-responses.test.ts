import { test, expect, mock } from "bun:test"

import type { ResponsesPayload } from "../src/services/copilot/create-responses"

import { state } from "../src/lib/state"
import { createResponses } from "../src/services/copilot/create-responses"

// Mock state
state.copilotToken = "test-token"
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

// Helper to mock fetch
const fetchMock = mock(
  (_url: string, opts: { headers: Record<string, string>; body: string }) => {
    return {
      ok: true,
      json: () => ({ id: "resp_123", object: "response", output: [] }),
      headers: opts.headers,
    }
  },
)
// @ts-expect-error - Mock fetch doesn't implement all fetch properties
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock

test("sets X-Initiator to agent if tool/assistant present in input", async () => {
  const payload: ResponsesPayload = {
    model: "gpt-test",
    input: [
      { role: "user", content: [{ type: "input_text", text: "hi" }] },
      { role: "tool", content: [{ type: "output_text", text: "tool call" }] },
    ],
  }
  await createResponses(payload)
  const headers = (
    fetchMock.mock.calls.at(-1)?.[1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("agent")
})

test("sets X-Initiator to user if only user present in input", async () => {
  const payload: ResponsesPayload = {
    model: "gpt-test",
    input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
  }
  await createResponses(payload)
  const headers = (
    fetchMock.mock.calls.at(-1)?.[1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")
})

test("sets X-Initiator to user for a plain string input", async () => {
  const payload: ResponsesPayload = { model: "gpt-test", input: "hi" }
  await createResponses(payload)
  const headers = (
    fetchMock.mock.calls.at(-1)?.[1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")
})

test("enables vision header when input contains an input_image part", async () => {
  const payload: ResponsesPayload = {
    model: "gpt-test",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "what is this?" },
          { type: "input_image", image_url: "https://example.test/a.png" },
        ],
      },
    ],
  }
  await createResponses(payload)
  const headers = (
    fetchMock.mock.calls.at(-1)?.[1] as { headers: Record<string, string> }
  ).headers
  expect(headers["copilot-vision-request"]).toBe("true")
})

test("forwards the payload body unmodified", async () => {
  const payload: ResponsesPayload = {
    model: "gpt-test",
    input: "hi",
    max_output_tokens: 16,
    tools: [{ type: "function", name: "noop" }],
  }
  await createResponses(payload)
  const body = (fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body
  expect(JSON.parse(body)).toEqual(payload)
})

test("requests to the /responses endpoint", async () => {
  await createResponses({ model: "gpt-test", input: "hi" })
  const url = fetchMock.mock.calls.at(-1)?.[0] as string
  expect(url.endsWith("/responses")).toBe(true)
})
