# Structured Outputs

Force model responses to conform to a JSON schema using the `format` field on `/api/chat` or `/api/generate`.

## `format` Parameter

| Value | Behavior |
|---|---|
| `"json"` | Model returns free-form JSON (no schema enforcement) |
| `{ ... }` (JSON schema object) | Model output is constrained to match the provided schema |

Works with both `/api/chat` and `/api/generate`. Set `"stream": false` for easiest parsing.

## Basic JSON (no schema)

```json
{
  "model": "gpt-oss",
  "messages": [{"role": "user", "content": "Tell me about Canada."}],
  "stream": false,
  "format": "json"
}
```

## Schema-Constrained JSON

Pass a full JSON Schema object as `format`. The model's output will match the schema structure.

**Tip:** Also include the schema (or a description of the expected fields) in the prompt text to ground the model.

```json
{
  "model": "gpt-oss",
  "messages": [{"role": "user", "content": "Tell me about Canada."}],
  "stream": false,
  "format": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "capital": {"type": "string"},
      "languages": {
        "type": "array",
        "items": {"type": "string"}
      }
    },
    "required": ["name", "capital", "languages"]
  }
}
```

Response `message.content` (chat) or `response` (generate) will be a JSON string matching the schema.

## Parsing the Response

The response content is a **JSON string** — you must `JSON.parse()` it:

```typescript
const data = JSON.parse(response.message.content);
// data.name, data.capital, data.languages are now typed fields
```

## Tips for Reliable Structured Output

- **Lower temperature** (e.g. `0`) for more deterministic results.
- **Include the schema in the prompt** text to help the model understand expected fields.
- **Use `stream: false`** — parsing a complete JSON blob is simpler than assembling streamed chunks.
- **Validate after parsing** — the schema constrains the model but always validate in your application code.
- Works with vision/multimodal models too — pass `images` alongside `format` for structured image descriptions.
