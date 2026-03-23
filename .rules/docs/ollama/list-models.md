# List models

`GET /api/tags` — Fetch a list of locally available models and their details.

**Server:** `http://localhost:11434`

## Request

No parameters required.

```bash
curl http://localhost:11434/api/tags
```

## Response

| Field | Type | Description |
|---|---|---|
| `models` | ModelSummary[] | Array of available models |

### ModelSummary

| Field | Type | Description |
|---|---|---|
| `name` | string | Model name |
| `model` | string | Model name |
| `modified_at` | string | Last modified (ISO 8601) |
| `size` | integer | Size on disk (bytes) |
| `digest` | string | SHA256 digest |
| `details.format` | string | File format (e.g. `"gguf"`) |
| `details.family` | string | Primary model family (e.g. `"llama"`) |
| `details.families` | string[] | All families the model belongs to |
| `details.parameter_size` | string | Parameter count label (e.g. `"7B"`) |
| `details.quantization_level` | string | Quantization level (e.g. `"Q4_0"`) |

### Example response
```json
{
  "models": [
    {
      "name": "gemma3",
      "model": "gemma3",
      "modified_at": "2025-10-03T23:34:03.409490317-07:00",
      "size": 3338801804,
      "digest": "a2af6cc3eb7fa8be8504abaf9b04e88f17a119ec3f04a3addf55f92841195f5a",
      "details": {
        "format": "gguf",
        "family": "gemma",
        "families": ["gemma"],
        "parameter_size": "4.3B",
        "quantization_level": "Q4_K_M"
      }
    }
  ]
}
```
