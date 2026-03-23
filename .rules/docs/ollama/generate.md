# Generate a response

`POST /api/generate` — Generates a response for a provided prompt.

**Server:** `http://localhost:11434`

## Request

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | yes | Model name |
| `prompt` | string | no | Text for the model to generate a response from |
| `suffix` | string | no | Fill-in-the-middle text after the prompt, before the response |
| `images` | string[] | no | Base64-encoded images (for multimodal models) |
| `format` | string \| object | no | `"json"` or a JSON schema object for structured output |
| `system` | string | no | System prompt |
| `stream` | boolean | no | Stream partial responses (default: `true`) |
| `think` | boolean \| string | no | Enable thinking output (`true`/`false` or `"high"`, `"medium"`, `"low"`) |
| `raw` | boolean | no | Return raw response without prompt templating |
| `keep_alive` | string \| number | no | Keep-alive duration (e.g. `"5m"` or `0` to unload immediately) |
| `options` | ModelOptions | no | Runtime generation options (see below) |

### ModelOptions

| Field | Type | Description |
|---|---|---|
| `seed` | integer | Random seed for reproducible outputs |
| `temperature` | float | Randomness (higher = more random) |
| `top_k` | integer | Limit next token to K most likely |
| `top_p` | float | Nucleus sampling cumulative probability threshold |
| `min_p` | float | Minimum probability threshold |
| `stop` | string \| string[] | Stop sequences |
| `num_ctx` | integer | Context length (number of tokens) |
| `num_predict` | integer | Max tokens to generate |

## Response (non-streaming, `stream: false`)

| Field | Type | Description |
|---|---|---|
| `model` | string | Model name |
| `created_at` | string | ISO 8601 timestamp |
| `response` | string | Generated text |
| `thinking` | string | Thinking output (when `think` enabled) |
| `done` | boolean | Whether generation finished |
| `done_reason` | string | Why generation stopped |
| `total_duration` | integer | Total time (nanoseconds) |
| `load_duration` | integer | Model load time (nanoseconds) |
| `prompt_eval_count` | integer | Number of input tokens |
| `prompt_eval_duration` | integer | Prompt eval time (nanoseconds) |
| `eval_count` | integer | Number of output tokens |
| `eval_duration` | integer | Token generation time (nanoseconds) |

## Streaming Response (`stream: true`, default)

Returns `application/x-ndjson` — one JSON object per line. Each chunk has the same fields as the non-streaming response. The final chunk has `done: true` with duration/count stats.

## Examples

### Basic (streaming)
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "gemma3",
  "prompt": "Why is the sky blue?"
}'
```

### Non-streaming
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "gemma3",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

### With options
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "gemma3",
  "prompt": "Why is the sky blue?",
  "options": {
    "temperature": 0.8,
    "top_p": 0.9,
    "seed": 42
  }
}'
```

### Structured output (JSON schema)
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "gemma3",
  "prompt": "What are the populations of the United States and Canada?",
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

### Load / Unload model
```bash
# Load
curl http://localhost:11434/api/generate -d '{"model": "gemma3"}'
# Unload
curl http://localhost:11434/api/generate -d '{"model": "gemma3", "keep_alive": 0}'
```
