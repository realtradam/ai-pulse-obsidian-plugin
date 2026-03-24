# Streaming Responses

Streaming is **enabled by default** on `/api/generate`, `/api/chat`, and `/api/embed`. Set `"stream": false` to disable.

## Transport

- Content-Type: `application/x-ndjson` (newline-delimited JSON).
- Each line is a complete JSON object (one chunk).
- The **final chunk** has `"done": true` and includes duration/token stats.

## Chunk Fields by Endpoint

### `/api/generate`

| Field | Present when | Description |
|---|---|---|
| `response` | always | Partial generated text |
| `thinking` | `think` enabled | Partial thinking/reasoning trace |
| `done` | always | `false` until final chunk |

### `/api/chat`

| Field | Present when | Description |
|---|---|---|
| `message.content` | always | Partial assistant reply |
| `message.thinking` | `think` enabled | Partial thinking trace |
| `message.tool_calls` | model requests tool | Streamed tool call objects |
| `done` | always | `false` until final chunk |

## Accumulating Chunks

You **must** accumulate partial fields across chunks to reconstruct the full response. This is critical for:

1. **Content** — concatenate `response` (generate) or `message.content` (chat) from every chunk.
2. **Thinking** — concatenate `thinking` or `message.thinking` from every chunk.
3. **Tool calls** — collect `message.tool_calls` from chunks; pass the accumulated tool call back into the next request along with the tool result.

### Pseudocode (REST / `requestUrl`)

```
let content = ''
let thinking = ''
let toolCalls = []

for each line in response body (split by newline):
  chunk = JSON.parse(line)

  // Chat endpoint:
  if chunk.message.thinking:  thinking += chunk.message.thinking
  if chunk.message.content:   content  += chunk.message.content
  if chunk.message.tool_calls: toolCalls.push(...chunk.message.tool_calls)

  // Generate endpoint:
  if chunk.thinking:  thinking += chunk.thinking
  if chunk.response:  content  += chunk.response

  if chunk.done:
    // final chunk — stats available (total_duration, eval_count, etc.)
    break
```

## Maintaining Conversation History (Chat)

After streaming completes, append the accumulated assistant message to `messages` for the next request:

```json
{
  "role": "assistant",
  "content": "<accumulated content>",
  "thinking": "<accumulated thinking>",
  "tool_calls": [ ... ]
}
```

If tool calls were returned, also append tool results before the next request:

```json
{ "role": "tool", "content": "<tool result>" }
```

## When to Disable Streaming

Set `"stream": false` when:
- You only need the final result (simpler parsing).
- Using structured output (`format`) — the full JSON is easier to parse in one shot.
- Batch processing where incremental display is unnecessary.
