# Get version

`GET /api/version` — Retrieve the Ollama server version.

**Server:** `http://localhost:11434`

## Request

No parameters required.

```bash
curl http://localhost:11434/api/version
```

## Response

| Field | Type | Description |
|---|---|---|
| `version` | string | Ollama version (e.g. `"0.12.6"`) |
