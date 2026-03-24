# Thinking / Reasoning Traces

Thinking-capable models emit a separate `thinking` field containing their reasoning trace, distinct from the final answer in `content`/`response`.

## Enabling Thinking

Set the `think` field on `/api/chat` or `/api/generate` requests:

| `think` value | Behavior |
|---|---|
| `true` | Enable thinking (most models) |
| `false` | Disable thinking |
| `"low"` / `"medium"` / `"high"` | GPT-OSS only — controls trace length; `true`/`false` is ignored for this model |

Thinking is **enabled by default** for supported models.

## Response Fields

| Endpoint | Thinking field | Answer field |
|---|---|---|
| `/api/chat` | `message.thinking` | `message.content` |
| `/api/generate` | `thinking` | `response` |

### Non-streaming example

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen3",
  "messages": [{"role": "user", "content": "How many r's in strawberry?"}],
  "think": true,
  "stream": false
}'
```

Response includes both `message.thinking` (reasoning) and `message.content` (final answer).

## Streaming Thinking

When streaming with `think` enabled, chunks arrive in two phases:

1. **Thinking phase** — chunks have `message.thinking` (or `thinking`) populated, `content` empty.
2. **Answer phase** — chunks have `message.content` (or `response`) populated, `thinking` empty.

Detect the transition by checking which field is non-empty on each chunk. See `streaming.md` for accumulation details.

## Supported Models

- Qwen 3 (`qwen3`)
- GPT-OSS (`gpt-oss`) — requires `"low"` / `"medium"` / `"high"` instead of boolean
- DeepSeek V3.1 (`deepseek-v3.1`)
- DeepSeek R1 (`deepseek-r1`)
- Browse latest: [thinking models](https://ollama.com/search?c=thinking)

## Conversation History with Thinking

When maintaining chat history, include the `thinking` field in the assistant message so the model retains context of its reasoning:

```json
{
  "role": "assistant",
  "thinking": "<accumulated thinking>",
  "content": "<accumulated content>"
}
```
