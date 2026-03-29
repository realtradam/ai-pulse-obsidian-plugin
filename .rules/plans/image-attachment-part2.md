# Image Attachment — Part 2: Frontend (UI, Chat View, CSS)

## Overview

This part adds the user-facing UI for image attachments: the attach button, file picker, thumbnail preview strip, and the integration in `handleSend()` that converts images and injects the context note for the AI.

**Prerequisites:** Part 1 must be completed first (image-attachments module, save_image tool, pre-validation).

---

## Step 5: Update `src/chat-view.ts`

### New Imports

```typescript
import { setCurrentAttachments, clearCurrentAttachments } from "./image-attachments";
import type { ImageAttachment } from "./image-attachments";
```

### New Class Fields

```typescript
interface PendingAttachment {
    file: File;
    dataUrl: string;
    mimeType: string;
}

// In the ChatView class:
private pendingAttachments: PendingAttachment[] = [];
private attachmentStrip: HTMLDivElement | null = null;
private attachButton: HTMLButtonElement | null = null;
private fileInput: HTMLInputElement | null = null;
```

### UI Construction (in `onOpen()`)

Update the input row section. Current structure:

```
[textarea] [send]
```

New structure:

```
[attachment-strip (above input row, hidden when empty)]
[attach-btn] [textarea] [send]
```

#### Attachment Strip (above input row)

```typescript
// Before the inputRow creation:
this.attachmentStrip = messagesArea.createDiv({ cls: "ai-pulse-attachment-strip" });
this.attachmentStrip.style.display = "none";
```

#### Attach Button (left of textarea)

```typescript
// Inside the inputRow, before the textarea:
this.attachButton = inputRow.createEl("button", {
    cls: "ai-pulse-attach-btn",
    attr: { "aria-label": "Attach image" },
});
setIcon(this.attachButton, "image-plus");

// Hidden file input
this.fileInput = inputRow.createEl("input", {
    type: "file",
    attr: {
        accept: "image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml",
        multiple: "",
        style: "display:none",
    },
});

this.attachButton.addEventListener("click", () => {
    this.fileInput?.click();
});

this.fileInput.addEventListener("change", () => {
    if (this.fileInput === null || this.fileInput.files === null) return;
    void this.handleFileSelection(this.fileInput.files);
    this.fileInput.value = ""; // Reset so same file can be re-selected
});
```

### File Selection Handler

```typescript
private async handleFileSelection(files: FileList): Promise<void> {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file === undefined) continue;
        if (!file.type.startsWith("image/")) continue;

        const dataUrl = await this.readFileAsDataUrl(file);
        this.pendingAttachments.push({
            file,
            dataUrl,
            mimeType: file.type,
        });
    }
    this.renderAttachmentStrip();
}

private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            } else {
                reject(new Error("Failed to read file as data URL."));
            }
        };
        reader.onerror = () => reject(new Error("File read error."));
        reader.readAsDataURL(file);
    });
}
```

### Thumbnail Strip Rendering

```typescript
private renderAttachmentStrip(): void {
    if (this.attachmentStrip === null) return;
    this.attachmentStrip.empty();

    if (this.pendingAttachments.length === 0) {
        this.attachmentStrip.style.display = "none";
        return;
    }

    this.attachmentStrip.style.display = "flex";

    for (let i = 0; i < this.pendingAttachments.length; i++) {
        const attachment = this.pendingAttachments[i];
        if (attachment === undefined) continue;

        const thumb = this.attachmentStrip.createDiv({ cls: "ai-pulse-attachment-thumb" });
        const img = thumb.createEl("img", {
            attr: { src: attachment.dataUrl, alt: attachment.file.name },
        });
        void img; // suppress unused

        const removeBtn = thumb.createEl("button", {
            cls: "ai-pulse-attachment-remove",
            attr: { "aria-label": "Remove" },
        });
        setIcon(removeBtn, "x");

        const index = i;
        removeBtn.addEventListener("click", () => {
            this.pendingAttachments.splice(index, 1);
            this.renderAttachmentStrip();
        });
    }
}
```

### Update `handleSend()`

In `handleSend()`, after getting the text and before pushing the user message:

```typescript
// Convert pending attachments to ImageAttachment format for the tool
let messageContent = text;
if (this.pendingAttachments.length > 0) {
    const imageAttachments: ImageAttachment[] = [];
    for (const pa of this.pendingAttachments) {
        const arrayBuffer = await pa.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        const base64 = btoa(binary);

        imageAttachments.push({
            base64,
            mimeType: pa.mimeType,
            originalName: pa.file.name,
            arrayBuffer,
        });
    }

    // Set the module-level attachments for the save_image tool to access
    setCurrentAttachments(imageAttachments);

    // Prepend context note to the message for the LLM
    const count = this.pendingAttachments.length;
    messageContent = `[${count} image(s) are attached to this message. You MUST use the save_image tool to save them to the vault. Infer from the user's message how and where these images should be saved and embedded. Assume the user wants the images attached to whatever note they are asking you to create or edit.]\n\n${text}`;

    // Clear the UI attachments
    this.pendingAttachments = [];
    this.renderAttachmentStrip();
}

// Display the original text (without the context prefix) in the chat
this.appendMessage("user", text);

// Track the augmented message in history for the LLM
this.messages.push({ role: "user", content: messageContent });
```

**Important:** The existing code pushes `text` as the message content. Change it so:
- `appendMessage("user", text)` — shows original text in UI
- `this.messages.push({ role: "user", content: messageContent })` — sends augmented content to LLM

### Clean Up on Close

In `onClose()`:

```typescript
this.pendingAttachments = [];
clearCurrentAttachments();
this.attachmentStrip = null;
this.attachButton = null;
this.fileInput = null;
```

### Clean Up on Error/Abort

In the `catch` block of `handleSend()`, if the send fails:

```typescript
clearCurrentAttachments();
```

This ensures stale attachments don't leak to the next message.

### Streaming State

When streaming starts, disable the attach button:

```typescript
private setStreamingState(streaming: boolean): void {
    // ...existing code...
    if (this.attachButton !== null) {
        this.attachButton.disabled = streaming;
    }
}
```

---

## Step 6: CSS Changes (`styles.css`)

### Attach Button

```css
.ai-pulse-attach-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
}

.ai-pulse-attach-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
}

.ai-pulse-attach-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
```

### Attachment Preview Strip

```css
.ai-pulse-attachment-strip {
    display: flex;
    gap: 6px;
    padding: 6px 8px;
    overflow-x: auto;
    flex-wrap: nowrap;
}

.ai-pulse-attachment-thumb {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 4px;
    overflow: visible;
    flex-shrink: 0;
    border: 1px solid var(--background-modifier-border);
}

.ai-pulse-attachment-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
}

.ai-pulse-attachment-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--text-muted);
}

.ai-pulse-attachment-remove:hover {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
}

.ai-pulse-attachment-remove svg {
    width: 12px;
    height: 12px;
}
```

### Input Row Update

Ensure the input row uses flexbox with proper alignment:

```css
.ai-pulse-input-row {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    /* ...existing padding/margin styles... */
}
```

---

## Step 7: Testing

### Desktop
1. Open the chat panel
2. Click the attach button → file picker opens
3. Select one or more images → thumbnails appear in the strip
4. Click × on a thumbnail → it's removed
5. Type a message like "save this image to my notes/photos folder"
6. Send → AI calls save_image → approval prompt → image saved → AI embeds in note

### Mobile
1. Same flow as desktop
2. File picker should open the camera roll / gallery
3. Verify the thumbnails render correctly on small screens
4. Verify the attach button is accessible and doesn't crowd the input

### Edge Cases
- Send message with no text but images attached (should still work — the context note provides enough info)
- Abort mid-stream → attachments should be cleared
- Clear chat while attachments are pending → attachments should be cleared
- Multiple images with same name → numbered suffixes prevent collisions

---

## Summary of All File Changes

### Files Created (Part 1)
- `src/image-attachments.ts`
- `src/context/tools/save-image.json`

### Files Modified (Part 1)
- `src/tools.ts` — new tool entry + execute function
- `src/ollama-client.ts` — pre-validation

### Files Modified (Part 2)
- `src/chat-view.ts` — attach button, file picker, thumbnail strip, handleSend() changes
- `styles.css` — new CSS classes for attachment UI
