# Ollama API Docs — AI Note Organizer

Local LLM inference via Ollama (`http://localhost:11434`). Docs are in `.rules/docs/ollama/`.

## Where to Look

| Need to... | File |
|------------|------|
| One-shot text completion, prompt/suffix, system prompt | `.rules/docs/ollama/generate.md` |
| ModelOptions (temperature, top_k, top_p, seed, num_ctx, stop, etc.) | `.rules/docs/ollama/generate.md` |
| Structured output via `format` (JSON / JSON schema) | `.rules/docs/ollama/generate.md` |
| Load / unload a model (`keep_alive`) | `.rules/docs/ollama/generate.md` |
| Streaming vs non-streaming response handling | `.rules/docs/ollama/generate.md` |
| Thinking / reasoning traces (`think` param) | `.rules/docs/ollama/generate.md` |
| Multi-turn conversation (chat history, roles) | `.rules/docs/ollama/chat.md` |
| Tool / function calling (define tools, handle tool_calls) | `.rules/docs/ollama/chat.md` |
| ChatMessage, ToolDefinition, ToolCall schemas | `.rules/docs/ollama/chat.md` |
| Generate vector embeddings from text | `.rules/docs/ollama/embed.md` |
| Batch embed multiple strings at once | `.rules/docs/ollama/embed.md` |
| List locally available models | `.rules/docs/ollama/list-models.md` |
| Get model details (parameters, template, license) | `.rules/docs/ollama/show-model.md` |
| Check Ollama server version / health | `.rules/docs/ollama/version.md` |
