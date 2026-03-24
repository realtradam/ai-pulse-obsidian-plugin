# Tool Calling (Function Calling)

Tool calling lets the model invoke functions you define and incorporate their results. Uses `/api/chat` with the `tools` parameter.

## Flow Overview

1. Send a request with `tools` definitions and a user message.
2. Model responds with `message.tool_calls` (instead of or alongside `content`).
3. Execute the requested function(s) locally.
4. Append the assistant message (with `tool_calls`) and tool result messages back to `messages`.
5. Send follow-up request — model generates final answer using tool results.

## Tool Definition Schema

```json
{
  "type": "function",
  "function": {
    "name": "get_temperature",
    "description": "Get the current temperature for a city",
    "parameters": {
      "type": "object",
      "required": ["city"],
      "properties": {
        "city": { "type": "string", "description": "The name of the city" }
      }
    }
  }
}
```

## Tool Result Message

After executing a tool, append a message with `role: "tool"`:

```json
{ "role": "tool", "tool_name": "get_temperature", "content": "22°C" }
```

## Single Tool Call

```json
{
  "model": "qwen3",
  "messages": [
    { "role": "user", "content": "What is the temperature in New York?" }
  ],
  "tools": [ /* tool definitions */ ],
  "stream": false
}
```

Response includes `message.tool_calls`:

```json
{
  "message": {
    "role": "assistant",
    "tool_calls": [{
      "type": "function",
      "function": {
        "index": 0,
        "name": "get_temperature",
        "arguments": { "city": "New York" }
      }
    }]
  }
}
```

Follow up with the full conversation history:

```json
{
  "model": "qwen3",
  "messages": [
    { "role": "user", "content": "What is the temperature in New York?" },
    { "role": "assistant", "tool_calls": [ /* from response above */ ] },
    { "role": "tool", "tool_name": "get_temperature", "content": "22°C" }
  ],
  "stream": false
}
```

## Parallel Tool Calls

The model may return **multiple** `tool_calls` in a single response. Execute all of them locally and append each result as a separate `role: "tool"` message, in the same order as the calls.

```json
"tool_calls": [
  { "function": { "index": 0, "name": "get_temperature", "arguments": { "city": "New York" } } },
  { "function": { "index": 1, "name": "get_conditions", "arguments": { "city": "New York" } } },
  { "function": { "index": 2, "name": "get_temperature", "arguments": { "city": "London" } } },
  { "function": { "index": 3, "name": "get_conditions", "arguments": { "city": "London" } } }
]
```

Then append tool results in order:

```json
{ "role": "tool", "tool_name": "get_temperature", "content": "22°C" },
{ "role": "tool", "tool_name": "get_conditions", "content": "Partly cloudy" },
{ "role": "tool", "tool_name": "get_temperature", "content": "15°C" },
{ "role": "tool", "tool_name": "get_conditions", "content": "Rainy" }
```

## Agent Loop (Multi-Turn Tool Calling)

For complex tasks the model may need multiple rounds of tool calls. Use a loop:

```
messages = [user message]
while true:
  response = chat(model, messages, tools)
  messages.append(response.message)

  if no tool_calls in response:
    break  // model is done, response.message.content has the answer

  for each tool_call:
    result = execute(tool_call.function.name, tool_call.function.arguments)
    messages.append({ role: "tool", tool_name: ..., content: result })

  // loop continues — model sees tool results and may call more tools
```

**Tip:** Include in the system prompt that the model is in a loop and can make multiple tool calls.

## Tool Calling with Streaming

When `stream: true`, accumulate `message.tool_calls` from chunks alongside `content` and `thinking`. After the stream ends:

1. Append the accumulated assistant message (with all fields) to `messages`.
2. Execute tool calls and append results.
3. Continue the loop.

See `streaming.md` for chunk accumulation details.

## Key Points

- Always pass `tools` in follow-up requests so the model knows tools are still available.
- The `tool_calls[].function.index` field indicates call ordering for parallel calls.
- Tool calling works with `think: true` — the model reasons before deciding which tools to call.
- `stream: false` is simpler for tool calling; streaming requires accumulating partial tool call chunks.
