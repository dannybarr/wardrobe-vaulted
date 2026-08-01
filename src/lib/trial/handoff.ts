/**
 * A photo chosen on the landing page, carried across the navigation into the
 * trial wardrobe so a direct upload goes straight into the first-outfit flow.
 * Kept in memory only — it never leaves the browser tab.
 */
let pending: File | null = null;

export function setPendingOutfitPhoto(file: File | null) {
  pending = file;
}

export function takePendingOutfitPhoto(): File | null {
  const file = pending;
  pending = null;
  return file;
}
