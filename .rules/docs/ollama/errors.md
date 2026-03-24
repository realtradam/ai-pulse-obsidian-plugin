# Error Handling

## HTTP Status Codes

All endpoints return standard HTTP status codes:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad Request (missing parameters, invalid JSON) |
| `404` | Not Found (model doesn't exist) |
| `500` | Internal Server Error |

## Error Response Format

Non-streaming errors return `application/json`:

```json
{
  "error": "the model failed to generate a response"
}
```

## Errors During Streaming

If an error occurs **mid-stream**, the error appears as an ndjson line with an `error` property. The HTTP status code will still be `200` since the response already started:

```
{"model":"gemma3","created_at":"...","response":" Yes","done":false}
{"model":"gemma3","created_at":"...","response":".","done":false}
{"error":"an error was encountered while running the model"}
```

When parsing streamed chunks, always check for an `error` field on each line before processing `response`/`message` fields.
