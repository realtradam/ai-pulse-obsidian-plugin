# Vision (Multimodal Image Input)

Vision-capable models accept images alongside text prompts for description, classification, and visual Q&A.

## How to Send Images

Add an `images` array to a message in `/api/chat` or to the top-level request in `/api/generate`.

**REST API:** Images must be **base64-encoded** strings (no file paths or URLs).

### `/api/chat` example

```json
{
  "model": "gemma3",
  "messages": [{
    "role": "user",
    "content": "What is in this image?",
    "images": ["<base64-encoded image data>"]
  }],
  "stream": false
}
```

### `/api/generate` example

```json
{
  "model": "gemma3",
  "prompt": "Describe this image.",
  "images": ["<base64-encoded image data>"],
  "stream": false
}
```

## Base64 Encoding

In an Obsidian plugin context (TypeScript), convert an `ArrayBuffer` to base64:

```typescript
const buffer = await vault.readBinary(file);
const bytes = new Uint8Array(buffer);
let binary = '';
for (const b of bytes) binary += String.fromCharCode(b);
const base64 = btoa(binary);
```

## Multiple Images

Pass multiple base64 strings in the `images` array. The model will consider all of them in context.

```json
"images": ["<base64_image_1>", "<base64_image_2>"]
```

## Combining with Structured Output

Vision works with the `format` parameter — use a JSON schema to get structured descriptions:

```json
{
  "model": "gemma3",
  "messages": [{
    "role": "user",
    "content": "Describe the objects in this photo.",
    "images": ["<base64>"]
  }],
  "stream": false,
  "format": {
    "type": "object",
    "properties": {
      "objects": {
        "type": "array",
        "items": {"type": "string"}
      }
    },
    "required": ["objects"]
  }
}
```

## Supported Models

Any model with vision/multimodal capability, e.g.:
- `gemma3`
- `llava`
- Browse: [vision models](https://ollama.com/search?c=vision)
