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
