import { createSignal } from "solid-js";

/** Global signal controlling which image (if any) is being previewed. */
const [previewImageUrl, setPreviewImageUrl] = createSignal<string | null>(null);

/** Open the image preview modal with the given image URL. */
export function openImagePreview(url: string): void {
  setPreviewImageUrl(url);
}

/** Close the image preview modal. */
export function closeImagePreview(): void {
  setPreviewImageUrl(null);
}

export { previewImageUrl };
