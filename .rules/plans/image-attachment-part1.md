# Image Attachment — Part 1: Backend (Tool, Data Flow, Ollama Integration)

## Overview

This part creates the backend infrastructure for image attachments: the module-level attachment storage, the `save_image` tool (context JSON + execute function + registry entry), and the Ollama integration (pre-validation + context injection).

**After this part is complete**, the `save_image` tool will be fully functional — it just won't have a UI to attach images yet. That comes in Part 2.

---

## Step 1: Create `src/image-attachments.ts`

Module-level storage for pending image attachments. The `ChatView` sets attachments before sending, and `executeSaveImage` reads them.

```typescript
export interface ImageAttachment {
    base64: string;
    mimeType: string;
    originalName: string;
    arrayBuffer: ArrayBuffer;
}

let currentAttachments: ImageAttachment[] = [];

export function setCurrentAttachments(attachments: ImageAttachment[]): void {
    currentAttachments = attachments;
}

export function getCurrentAttachments(): ImageAttachment[] {
    return currentAttachments;
}

export function clearCurrentAttachments(): void {
    currentAttachments = [];
}

export function hasCurrentAttachments(): boolean {
    return currentAttachments.length > 0;
}
```

---

## Step 2: Create `src/context/tools/save-image.json`

Tool context JSON following the project convention (one JSON file per tool in `src/context/tools/`).

```json
{
    "id": "save_image",
    "label": "Save Image",
    "description": "Save attached image(s) to the vault at a specified path.",
    "friendlyName": "Save Image",
    "requiresApproval": true,
    "definition": {
        "type": "function",
        "function": {
            "name": "save_image",
            "description": "Save image(s) attached to the current chat message into the vault. The user has attached image(s) to their message — this tool writes them as files. You provide the vault-relative path WITHOUT the file extension (the correct extension is detected automatically from the image type). If multiple images are attached and you provide a single path, they will be saved as path_1.ext, path_2.ext, etc. If no images are attached, this tool returns an error. This action requires user approval.",
            "parameters": {
                "type": "object",
                "required": ["file_path"],
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The vault-relative path for the image WITHOUT the file extension. The extension is added automatically based on the image type (e.g., .jpg, .png). Example: 'attachments/cool-keyboard' will become 'attachments/cool-keyboard.jpg'. For multiple images with a single path, they are numbered: 'attachments/cool-keyboard_1.jpg', 'attachments/cool-keyboard_2.jpg', etc."
                    }
                }
            }
        }
    }
}
```

---

## Step 3: Add `executeSaveImage` and registry entry in `src/tools.ts`

### Import

```typescript
import saveImageCtx from "./context/tools/save-image.json";
import { getCurrentAttachments, clearCurrentAttachments } from "./image-attachments";
```

### MIME → Extension Map

```typescript
function mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
        "image/svg+xml": ".svg",
    };
    return map[mimeType] ?? ".png";
}
```

### Execute Function

```typescript
async function executeSaveImage(app: App, args: Record<string, unknown>): Promise<string> {
    const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
    if (filePath === "") {
        return "Error: file_path parameter is required.";
    }

    const attachments = getCurrentAttachments();
    if (attachments.length === 0) {
        return "Error: No images are attached to the current message.";
    }

    const savedPaths: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i];
        if (attachment === undefined) continue;

        const ext = mimeToExtension(attachment.mimeType);
        const fullPath = attachments.length === 1
            ? `${filePath}${ext}`
            : `${filePath}_${i + 1}${ext}`;

        // Check if file already exists
        const existing = app.vault.getAbstractFileByPath(fullPath);
        if (existing !== null) {
            errors.push(`"${fullPath}" already exists — skipped.`);
            continue;
        }

        // Ensure parent folder exists
        const lastSlash = fullPath.lastIndexOf("/");
        if (lastSlash > 0) {
            const folderPath = fullPath.substring(0, lastSlash);
            const folder = app.vault.getFolderByPath(folderPath);
            if (folder === null) {
                await app.vault.createFolder(folderPath);
            }
        }

        try {
            await app.vault.createBinary(fullPath, attachment.arrayBuffer);
            savedPaths.push(fullPath);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            errors.push(`"${fullPath}": ${msg}`);
        }
    }

    clearCurrentAttachments();

    const parts: string[] = [];
    if (savedPaths.length > 0) {
        parts.push(`Saved ${savedPaths.length} image(s):\n${savedPaths.map(p => `- ${p}`).join("\n")}`);
    }
    if (errors.length > 0) {
        parts.push(`Errors:\n${errors.map(e => `- ${e}`).join("\n")}`);
    }

    return parts.join("\n\n");
}
```

### Registry Entry

Add to `TOOL_REGISTRY` array:

```typescript
{
    ...asToolContext(saveImageCtx as Record<string, unknown>),
    approvalMessage: (args) => {
        const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "unknown";
        const count = getCurrentAttachments().length;
        return `Save ${count} image(s) to "${filePath}"?`;
    },
    summarize: (args) => {
        const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
        const count = getCurrentAttachments().length;
        return `${count} image(s) → "/${filePath}"`;
    },
    summarizeResult: (result) => {
        if (result.startsWith("Error")) return result;
        if (result.includes("declined")) return "Declined by user";
        const match = result.match(/Saved (\d+) image/);
        if (match !== null) return `${match[1]} image(s) saved`;
        return "Images saved";
    },
    execute: executeSaveImage,
},
```

---

## Step 4: Add pre-validation in `src/ollama-client.ts`

### `preValidateSaveImage` Function

Add to the `preValidateTool` switch:

```typescript
case "save_image":
    return preValidateSaveImage(app, args);
```

The validation function:

```typescript
function preValidateSaveImage(_app: App, args: Record<string, unknown>): string | null {
    const filePath = typeof args["file_path"] === "string" ? args["file_path"] : "";
    if (filePath === "") {
        return "Error: file_path parameter is required.";
    }

    // Import and check attachments
    // Need to import: import { hasCurrentAttachments } from "./image-attachments";
    if (!hasCurrentAttachments()) {
        return "Error: No images are attached to the current message. The user must attach images before you can save them.";
    }

    return null;
}
```

### Import

Add to `ollama-client.ts` imports:

```typescript
import { hasCurrentAttachments } from "./image-attachments";
```

### Context Injection

In the `chatAgentLoop` function (or in the `sendChatMessageStreaming` function), before building the working messages, check if the **last user message** was sent with attachments. If so, prepend a context note to it.

**Where to inject:** In `chat-view.ts`'s `handleSend()`, before pushing the user message to `this.messages`, modify the content if attachments are present:

```typescript
let messageContent = text;
if (pendingAttachments.length > 0) {
    const count = pendingAttachments.length;
    messageContent = `[${count} image(s) are attached to this message. You MUST use the save_image tool to save them to the vault. Infer from the user's message how and where these images should be saved and embedded. Assume the user wants the images attached to whatever note they are asking you to create or edit.]\n\n${text}`;
}
```

The injected context is prepended to the user's message content, so:
- The AI always sees the attachment info alongside the user's request
- The display message (`appendMessage`) still shows only the original `text`
- The `messages[]` array (sent to LLM) contains the augmented `messageContent`

**Note:** This injection happens in `chat-view.ts` (Part 2), but the logic is documented here for completeness. In Part 1, just ensure the `save_image` tool and pre-validation are ready.

---

## Testing After Part 1

After completing Part 1, you can test manually by:

1. Calling `setCurrentAttachments(...)` from the browser console with a test image
2. Sending a chat message asking the AI to save the image
3. Verifying the tool executes and writes the file to the vault

The full UI integration comes in Part 2.
