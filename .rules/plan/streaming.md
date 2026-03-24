# Plan: Streaming AI Responses

## Goal
Show AI text token-by-token as it arrives, instead of waiting for the full response.

## Key Changes

### 1. `src/ollama-client.ts` — New streaming chat function
- Add a `sendChatMessageStreaming()` function that sets `stream: true` in the request body.
- Ollama returns `application/x-ndjson` — each line is a JSON chunk with `message.content` (partial text).
- The final chunk has `done: true`.
- Use native `fetch()` API with `response.body.getReader()` + `TextDecoder` to read chunks, split by newlines, parse each JSON line. (`requestUrl()` does not support streaming.)
- Accept an `onChunk(text: string)` callback that fires for every content delta.
- Accept an `AbortSignal` for cancellation support.
- For the tool-calling agent loop: after streaming completes, check the accumulated message for `tool_calls`. If present, execute tools (non-streamed), then stream the next turn. Only the final text turn streams visibly. Tool execution rounds stay non-streamed.
- Return the full accumulated text at the end.

### 2. `src/chat-view.ts` — Progressive message rendering
- When sending, create an empty assistant message bubble immediately.
- Pass an `onChunk` callback that appends each text delta to that bubble's `textContent`.
- Scroll to bottom on each chunk (debounced to ~50ms to avoid performance issues).
- While streaming: disable the Send button, show a "Stop" button that can abort the stream via `AbortController`.
- On stream end or abort: finalize the message, re-enable input.

### 3. `styles.css` — Minor additions
- Add a blinking cursor indicator on the streaming message bubble (e.g. `::after` pseudo-element).
- Style the Stop button.

## Considerations
- **`fetch()` vs `requestUrl()`:** `requestUrl` is Obsidian's abstraction (works on mobile, handles CORS). `fetch` works for localhost calls on desktop. On mobile, `fetch` to `localhost` may not work. Use `fetch` only for streaming and keep `requestUrl` for non-streaming/fallback.
- **Tool calling + streaming:** Ollama supports streaming with tools. Streamed chunks accumulate `tool_calls` across multiple chunks. Simpler approach: use streaming for the text response; if tool calls come back, fall back to non-streamed agent loop for tool execution, then stream the final response.
- **Abort handling:** `AbortController` passed to `fetch`. On abort, clean up gracefully — keep partial text visible in the chat but don't add it to message history for future context.

## Estimated file changes
| File | Change |
|------|--------|
| `ollama-client.ts` | Add `sendChatMessageStreaming()`, keep existing `sendChatMessage()` |
| `chat-view.ts` | New streaming send flow, onChunk handler, stop button, debounced scroll |
| `styles.css` | Streaming cursor animation, stop button style |
