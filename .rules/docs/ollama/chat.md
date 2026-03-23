# Generate a chat message

`POST /api/chat` — Generate the next message in a conversation between a user and an assistant.

**Server:** `http://localhost:11434`

## Request

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | yes | Model name |
| `messages` | ChatMessage[] | yes | Chat history (array of message objects) |
| `tools` | ToolDefinition[] | no | Function tools the model may call |
| `format` | `"json"` \| object | no | Response format — `"json"` or a JSON schema |
| `options` | ModelOptions | no | Runtime generation options (see generate.md) |
| `stream` | boolean | no | Stream partial responses (default: `true`) |
| `think` | boolean \| string | no | Enable thinking output (`true`/`false` or `"high"`, `"medium"`, `"low"`) |
| `keep_alive` | string \| number | no | Keep-alive duration (e.g. `"5m"` or `0` to unload) |

### ChatMessage

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | string | yes | `"system"`, `"user"`, `"assistant"`, or `"tool"` |
| `content` | string | yes | Message text |
| `images` | string[] | no | Base64-encoded images (multimodal) |
| `tool_calls` | ToolCall[] | no | Tool calls from the model |

### ToolDefinition

```json
{
  "type": "function",
  "function": {
    "name": "function_name",
    "description": "What the function does",
    "parameters": { /* JSON Schema */ }
  }
}
```

### ToolCall

```json
{
  "function": {
    "name": "function_name",
    "arguments": { /* key-value args */ }
  }
}
```

## Response (non-streaming, `stream: false`)

| Field | Type | Description |
|---|---|---|
| `model` | string | Model name |
| `created_at` | string | ISO 8601 timestamp |
| `message.role` | string | Always `"assistant"` |
| `message.content` | string | Assistant reply text |
| `message.thinking` | string | Thinking trace (when `think` enabled) |
| `message.tool_calls` | ToolCall[] | Tool calls requested by assistant |
| `done` | boolean | Whether the response finished |
| `done_reason` | string | Why it finished |
| `total_duration` | integer | Total time (nanoseconds) |
| `load_duration` | integer | Model load time (nanoseconds) |
| `prompt_eval_count` | integer | Input token count |
| `prompt_eval_duration` | integer | Prompt eval time (nanoseconds) |
| `eval_count` | integer | Output token count |
| `eval_duration` | integer | Token generation time (nanoseconds) |

## Streaming Response (`stream: true`, default)

Returns `application/x-ndjson`. Each chunk has `message.content` (partial text). Final chunk has `done: true` with duration/count stats.

## Examples

### Basic (streaming)
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "gemma3",
  "messages": [
    {"role": "user", "content": "why is the sky blue?"}
  ]
}'
```

### Non-streaming
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "gemma3",
  "messages": [
    {"role": "user", "content": "why is the sky blue?"}
  ],
  "stream": false
}'
```

### Structured output
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "gemma3",
  "messages": [
    {"role": "user", "content": "What are the populations of the United States and Canada?"}
  ],
  "stream": false,
  "format": {
    "type": "object",
    "properties": {
      "countries": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "country": {"type": "string"},
            "population": {"type": "integer"}
          },
          "required": ["country", "population"]
        }
      }
    },
    "required": ["countries"]
  }
}'
```

### Tool calling
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen3",
  "messages": [
    {"role": "user", "content": "What is the weather today in Paris?"}
  ],
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_current_weather",
        "description": "Get the current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The location, e.g. San Francisco, CA"
            },
            "format": {
              "type": "string",
              "description": "celsius or fahrenheit",
              "enum": ["celsius", "fahrenheit"]
            }
          },
          "required": ["location", "format"]
        }
      }
    }
  ]
}'
```

### Thinking
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "gpt-oss",
  "messages": [
    {"role": "user", "content": "What is 1+1?"}
  ],
  "think": "low"
}'
```
