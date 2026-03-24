# Generate Embeddings

`POST /api/embed` — Creates vector embeddings representing the input text.

**Server:** `http://localhost:11434`

Embeddings turn text into numeric vectors for semantic search, retrieval, and RAG pipelines. Vector length depends on the model (typically 384–1024 dimensions). Vectors are **L2-normalized** (unit-length).

## Recommended Models

- `embeddinggemma`
- `qwen3-embedding`
- `all-minilm`

## Request

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | yes | Model name (e.g. `"embeddinggemma"`) |
| `input` | string \| string[] | yes | Text or array of texts to embed |
| `truncate` | boolean | no | Truncate inputs exceeding context window (default: `true`). If `false`, returns an error. |
| `dimensions` | integer | no | Number of dimensions for the embedding vectors |
| `keep_alive` | string | no | Model keep-alive duration |
| `options` | ModelOptions | no | Runtime options (see generate.md) |

## Response

| Field | Type | Description |
|---|---|---|
| `model` | string | Model that produced the embeddings |
| `embeddings` | number[][] | Array of embedding vectors (one per input) |
| `total_duration` | integer | Total time (nanoseconds) |
| `load_duration` | integer | Model load time (nanoseconds) |
| `prompt_eval_count` | integer | Number of input tokens processed |

## Examples

### Single input
```bash
curl http://localhost:11434/api/embed -d '{
  "model": "embeddinggemma",
  "input": "Why is the sky blue?"
}'
```

### Multiple inputs (batch)
```bash
curl http://localhost:11434/api/embed -d '{
  "model": "embeddinggemma",
  "input": [
    "Why is the sky blue?",
    "Why is the grass green?"
  ]
}'
```

### Custom dimensions
```bash
curl http://localhost:11434/api/embed -d '{
  "model": "embeddinggemma",
  "input": "Generate embeddings for this text",
  "dimensions": 128
}'
```

## Tips

- Use **cosine similarity** for most semantic search use cases.
- Use the **same embedding model** for both indexing and querying.
- Batch multiple strings in one request for efficiency.
