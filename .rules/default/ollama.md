# Ollama API Docs — AI Pulse

Local LLM inference via Ollama (`http://localhost:11434`). Docs are in `.rules/docs/ollama/`.

## Where to Look

| Need to... | File |
|------------|------|
| One-shot text completion, prompt/suffix, system prompt | `.rules/docs/ollama/generate.md` |
| ModelOptions (temperature, top_k, top_p, seed, num_ctx, stop, etc.) | `.rules/docs/ollama/generate.md` |
| Structured output via `format` (JSON / JSON schema) | `.rules/docs/ollama/structured-outputs.md` |
| Parsing and validating structured responses | `.rules/docs/ollama/structured-outputs.md` |
| Load / unload a model (`keep_alive`) | `.rules/docs/ollama/generate.md` |
| Streaming vs non-streaming response handling | `.rules/docs/ollama/streaming.md` |
| Accumulating streamed chunks (content, thinking, tool calls) | `.rules/docs/ollama/streaming.md` |
| When to disable streaming | `.rules/docs/ollama/streaming.md` |
| Thinking / reasoning traces (`think` param) | `.rules/docs/ollama/thinking.md` |
| Supported thinking models (Qwen 3, DeepSeek R1, GPT-OSS, etc.) | `.rules/docs/ollama/thinking.md` |
| Streaming thinking chunks (two-phase output) | `.rules/docs/ollama/thinking.md` |
| Multi-turn conversation (chat history, roles) | `.rules/docs/ollama/chat.md` |
| Tool / function calling (define tools, handle tool_calls) | `.rules/docs/ollama/tool-calling.md` |
| Parallel tool calls, agent loop (multi-turn tools) | `.rules/docs/ollama/tool-calling.md` |
| Tool calling with streaming | `.rules/docs/ollama/tool-calling.md` |
| Tool result messages (`role: "tool"`) | `.rules/docs/ollama/tool-calling.md` |
| ChatMessage, ToolDefinition, ToolCall schemas | `.rules/docs/ollama/chat.md` |
| Generate vector embeddings from text | `.rules/docs/ollama/embed.md` |
| Batch embed multiple strings at once | `.rules/docs/ollama/embed.md` |
| Recommended embedding models | `.rules/docs/ollama/embed.md` |
| Cosine similarity, RAG tips for embeddings | `.rules/docs/ollama/embed.md` |
| List locally available models | `.rules/docs/ollama/list-models.md` |
| Get model details (parameters, template, license) | `.rules/docs/ollama/show-model.md` |
| Check Ollama server version / health | `.rules/docs/ollama/version.md` |
| HTTP status codes, error response format | `.rules/docs/ollama/errors.md` |
| Handling errors during streaming | `.rules/docs/ollama/errors.md` |
| Send images to vision/multimodal models | `.rules/docs/ollama/vision.md` |
| Base64-encode images for the REST API | `.rules/docs/ollama/vision.md` |
| Combine vision with structured output | `.rules/docs/ollama/vision.md` |

## Related Files

Some docs are closely coupled. When reading one, also check its companions:

| File | Also read |
|------|----------|
| `chat.md` | `tool-calling.md` (tool calling uses `/api/chat`), `streaming.md` (streaming chat responses) |
| `tool-calling.md` | `chat.md` (ChatMessage/ToolDefinition/ToolCall schemas), `streaming.md` (accumulating streamed tool calls) |
| `streaming.md` | `thinking.md` (two-phase thinking+content chunks), `tool-calling.md` (streaming tool calls), `errors.md` (mid-stream errors) |
| `errors.md` | `streaming.md` (mid-stream error handling requires checking each chunk) |
| `thinking.md` | `streaming.md` (accumulating thinking chunks in streamed responses) |
| `generate.md` | Defines `ModelOptions` — referenced by `chat.md`, `embed.md`, and others |
| `structured-outputs.md` | `vision.md` (combining vision with structured output) |
| `vision.md` | `structured-outputs.md` (JSON schema for structured image descriptions) |
