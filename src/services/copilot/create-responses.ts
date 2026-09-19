import consola from "consola"
import { events } from "fetch-event-stream"

import { copilotHeaders, copilotBaseUrl } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

/**
 * Proxies OpenAI Responses API (`/responses`) requests to GitHub Copilot.
 *
 * Unlike createChatCompletions, this is intentionally a thin pass-through:
 * the Responses payload shape is large and still evolving upstream, and
 * clients that target this endpoint (e.g. claude-code-router's
 * openai_responses transformer) already build a complete, correctly-shaped
 * request. We only inspect the handful of fields needed to pick headers
 * (vision, agent vs. user initiator) and forward everything else as-is.
 */
export const createResponses = async (payload: ResponsesPayload) => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const inputItems = Array.isArray(payload.input) ? payload.input : []

  const enableVision = inputItems.some(
    (item) =>
      isMessageInputItem(item)
      && Array.isArray(item.content)
      && item.content.some((part) => part.type === "input_image"),
  )

  const isAgentCall = inputItems.some(
    (item) =>
      isMessageInputItem(item) && ["assistant", "tool"].includes(item.role),
  )

  const headers: Record<string, string> = {
    ...copilotHeaders(state, enableVision),
    "X-Initiator": isAgentCall ? "agent" : "user",
  }

  const response = await fetch(`${copilotBaseUrl(state)}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    consola.error("Failed to create response", response)
    throw new HTTPError("Failed to create response", response)
  }

  if (payload.stream) {
    return events(response)
  }

  return (await response.json()) as Record<string, unknown>
}

function isMessageInputItem(
  item: ResponsesInputItem,
): item is ResponsesMessageInputItem {
  return "role" in item
}

// Payload types
//
// Deliberately loose: this endpoint forwards whatever the client sends
// (tools, reasoning, text.format, etc.) without validating or reshaping it,
// matching Responses API's much larger and still-changing surface.

export interface ResponsesPayload {
  model: string
  input: string | Array<ResponsesInputItem>
  stream?: boolean | null
  max_output_tokens?: number | null
  [key: string]: unknown
}

export type ResponsesInputItem =
  | ResponsesMessageInputItem
  | Record<string, unknown>

export interface ResponsesMessageInputItem {
  role: "user" | "assistant" | "system" | "developer" | "tool"
  content: string | Array<ResponsesContentPart>
}

export type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url?: string; file_id?: string }
  | { type: "output_text"; text: string }
  | { type: string; [key: string]: unknown }
