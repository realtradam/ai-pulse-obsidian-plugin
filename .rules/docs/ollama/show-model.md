# Show model details

`POST /api/show` — Get detailed information about a specific model.

**Server:** `http://localhost:11434`

## Request

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | yes | Model name to show |
| `verbose` | boolean | no | Include large verbose fields in the response |

## Response

| Field | Type | Description |
|---|---|---|
| `parameters` | string | Model parameter settings (text) |
| `modified_at` | string | Last modified (ISO 8601) |
| `template` | string | Prompt template used by the model |
| `capabilities` | string[] | Supported features (e.g. `"completion"`, `"vision"`) |
| `details.format` | string | File format (e.g. `"gguf"`) |
| `details.family` | string | Model family |
| `details.families` | string[] | All families |
| `details.parameter_size` | string | Parameter count label (e.g. `"4.3B"`) |
| `details.quantization_level` | string | Quantization level (e.g. `"Q4_K_M"`) |
| `model_info` | object | Architecture metadata (context length, embedding size, etc.) |

## Examples

```bash
curl http://localhost:11434/api/show -d '{
  "model": "gemma3"
}'
```

### Verbose
```bash
curl http://localhost:11434/api/show -d '{
  "model": "gemma3",
  "verbose": true
}'
```
