# Bug Investigation Report

**Date:** 2026-03-28
**Project:** AI Pulse — Obsidian Plugin

---

### Bug 1: Stop Button Does Not Work on Mobile

**Severity:** High
**Files involved:** `src/ollama-client.ts`, `src/chat-view.ts`

**Root Cause:**

The `abortSignal` is never passed to the mobile request strategy. In `sendChatMessageStreaming()`, the `abortSignal` is destructured from `opts` and forwarded to `buildDesktopStreamingStrategy()`, but `buildMobileStrategy()` does not accept or use it.

```
// ollama-client.ts — sendChatMessageStreaming()
const sendRequest: ChatRequestStrategy = Platform.isMobile
    ? buildMobileStrategy(ollamaUrl, model, tools, options, onChunk, onCreateBubble)
    //                     ^^^ abortSignal is NOT passed here
    : buildDesktopStreamingStrategy(ollamaUrl, model, tools, options, onChunk, onCreateBubble, abortSignal);
    //                              ^^^ abortSignal IS passed here
```

The `buildMobileStrategy` function signature does not include `abortSignal` at all. On mobile, requests go through Obsidian's `requestUrl()`, which does not natively support `AbortSignal`. This means:

1. Clicking "Stop" on mobile calls `this.abortController.abort()`, but no request is listening for it.
2. The mobile `requestUrl()` call continues running to completion.
3. The UI transitions back to "Send" state (since `handleSend` catches the abort), but the response still arrives and may cause stale state.

**Additional concern for desktop:**

On desktop, the abort is handled inside `buildDesktopStreamingStrategy` via the `signal` option on `fetch()`. When aborted, the `DOMException` with name `AbortError` is caught and returns `{ content, toolCalls: [] }`. However, back in `chatAgentLoop`, there is no mechanism to detect that an abort occurred — the loop will see an empty `toolCalls` array and simply return the partial `content`. This partial content is then pushed into `this.messages` as a complete assistant message, which could cause confusing conversation history.

**Recommendations:**

1. Pass `abortSignal` into `buildMobileStrategy`. While `requestUrl()` itself cannot be aborted, the strategy should check `abortSignal.aborted` before delivering chunks and return early from the agent loop.
2. For a complete mobile solution, consider wrapping the `requestUrl()` in a Promise that races against the abort signal, so the user sees immediate feedback even though the underlying HTTP request completes in the background.
3. On desktop, consider throwing an `AbortError` (or a custom error) instead of returning partial content, so the caller can distinguish an abort from a completed response. Alternatively, do not push partial abort content into `this.messages`.

---

### Bug 2: Chat Stops After First "to use" on Cold Model Start

**Severity:** Medium
**Files involved:** `src/ollama-client.ts`

**Root Cause:**

When Ollama has unloaded a model (due to `keep_alive` expiring or server restart), the first request triggers a full model load from disk into VRAM/RAM. During this loading period, the server takes a long time before sending the first token. The `fetch()` API (used in the desktop streaming strategy) has no explicit timeout configured, but the Obsidian WebView or the underlying Chromium network stack may impose default timeouts.

Specifically, the desktop streaming strategy uses bare `fetch()`:

```typescript
const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: abortSignal,
});
```

There is no timeout mechanism. Chromium's default connection timeout is typically around 300 seconds, but **read timeouts** (time between received bytes) can vary. When Ollama is loading a model:

1. The server accepts the TCP connection and may send HTTP headers promptly, so it's not a connection timeout.
2. The server starts streaming, but the model load phase means no data chunks are sent for potentially 30-60+ seconds.
3. Some environments impose an idle/read timeout that can kill the connection during this silence.

The fact that the response cuts off after "to use" (a few tokens) suggests the model load may complete and start generating, but the connection gets interrupted shortly after the first few chunks. This could be:

- **Obsidian's WebView enforcing a resource timeout** on the fetch response stream.
- **A proxy or firewall** between the plugin and Ollama timing out the idle connection.
- **Ollama itself** experiencing an issue during cold start where it partially responds then errors mid-stream.

The code does not check for `error` fields in streamed ndjson chunks (as documented in `errors.md`):

```typescript
for await (const chunk of readNdjsonStream(reader, decoder)) {
    const rawMsg: unknown = chunk.message;
    // ^^^ Never checks chunk.error
```

If Ollama sends a mid-stream error chunk (`{"error": "..."}`), the code silently ignores it (there's no `message` field in an error chunk), and the loop ends when the stream closes, returning whatever partial content was accumulated.

**Recommendations:**

1. Add mid-stream error detection in `readNdjsonStream` consumers — check for `chunk.error` on every chunk and throw a descriptive error.
2. Before the main streaming request, consider sending a lightweight "warm-up" request (e.g., a `POST /api/chat` with `keep_alive: "10m"` and a trivial prompt) when the model status is cold, or at least detect and inform the user that the model is loading.
3. If possible, use Obsidian's `requestUrl()` as a fallback even on desktop when the streaming connection drops unexpectedly. `requestUrl()` is more tolerant of long waits since it buffers the entire response.
4. Add explicit timeout logic: race the `fetch()` against a configurable timeout (e.g., 5 minutes) that resets on each received chunk, so the user gets a clear error instead of a silent truncation.

---

### Bug 3: Scroll to Bottom Does Not Work Properly

**Severity:** Medium
**Files involved:** `src/chat-view.ts`, `styles.css`

**Root Cause:**

The scroll target is wrong. The `scrollToBottom()` method scrolls `this.messageContainer`:

```typescript
private scrollToBottom(): void {
    if (this.messageContainer !== null) {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }
}
```

However, `this.messageContainer` is an inner `div` (`ai-pulse-messages`) nested inside `messagesArea` (`ai-pulse-messages-area`). Looking at the CSS:

```css
.ai-pulse-messages-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;    /* <-- this clips overflow */
    min-height: 0;
    position: relative;
}

.ai-pulse-messages {
    flex: 1;
    overflow-y: auto;    /* <-- this is the scroll container */
    padding: 8px;
    padding-top: 56px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
```

The `ai-pulse-messages` div has `overflow-y: auto` and `flex: 1`, which makes it the scrollable container. The `scrollTop = scrollHeight` approach should work in theory, but there are several problems:

**Problem A: Timing issue with content rendering.**

After `appendText(chunk)` or creating a new bubble, the DOM may not have reflowed yet. `scrollHeight` reflects the *current* layout, not the layout after the text was just appended. The `debouncedScrollToBottom()` method uses a 50ms timer, but this may not be enough for the browser to complete layout, especially with complex content or on mobile where rendering is slower.

**Problem B: `flex: 1` with `overflow-y: auto` and `display: flex` is unreliable on mobile.**

When the `ai-pulse-messages` container is a flex child with `flex: 1` and also has `display: flex; flex-direction: column`, some mobile WebView engines do not correctly calculate `scrollHeight` for flex containers. The `scrollHeight` may not include all children because flex layout can defer measurement.

**Problem C: The input row and FAB are siblings at the same level.**

The layout structure is:

```
contentEl (ai-pulse-chat-container)
  └── messagesArea (ai-pulse-messages-area)
        ├── messageContainer (ai-pulse-messages)  ← scroll target
        ├── modelBadge (absolute positioned)
        ├── fab (absolute positioned)
        └── inputRow (ai-pulse-input-row)
```

The `inputRow` is inside `messagesArea`, which has `overflow: hidden`. This means the input row takes up space from the flex container that `messageContainer` uses. Since `messageContainer` has `flex: 1`, it fills the remaining space. However, the actual scrollable height calculation can be unreliable when the input row's height changes (e.g., when the textarea is resized with `resize: vertical`).

**Problem D: No use of `scrollIntoView()`.**

The current approach uses `scrollTop = scrollHeight` on the container. A more reliable cross-platform approach is to use `element.scrollIntoView()` on the last child element, which delegates scroll calculation to the browser engine and handles flex layout edge cases better.

**Recommendations:**

1. Replace `scrollTop = scrollHeight` with `lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' })` on the last message bubble, which is more reliable across platforms.
2. Use `requestAnimationFrame()` before scrolling to ensure the DOM has reflowed:
   ```typescript
   requestAnimationFrame(() => {
       lastChild.scrollIntoView({ block: 'end' });
   });
   ```
3. Increase the debounce timer or switch the debounce to use `requestAnimationFrame` instead of `setTimeout`.
4. Consider adding a `MutationObserver` or `ResizeObserver` on the message container to auto-scroll whenever content height changes, rather than relying on manual calls scattered throughout the code.

---

### Summary Table

| # | Bug | Root Cause | Severity | Primary File |
|---|-----|-----------|----------|-------------|
| 1 | Stop button broken on mobile | `abortSignal` not passed to mobile strategy | High | `ollama-client.ts` |
| 2 | Chat cuts off on cold model start | No mid-stream error handling; no timeout/keepalive logic for slow model loads | Medium | `ollama-client.ts` |
| 3 | Scroll-to-bottom unreliable | `scrollTop = scrollHeight` unreliable in flex containers on mobile; no `requestAnimationFrame` gating | Medium | `chat-view.ts` |
