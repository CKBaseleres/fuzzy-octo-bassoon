export interface SavedFile {
  name: string;
  blob: Blob;
}

/**
 * Fakes the browser's "save to device" boundary (an object URL clicked through
 * an `<a download>`), which jsdom does not implement. Returns every save, in order.
 * `onSave` lets a test observe what else has happened at the moment of saving.
 */
export function captureSaves(onSave?: (file: SavedFile) => void): SavedFile[] {
  const saves: SavedFile[] = [];
  const blobs = new Map<string, Blob>();
  let next = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:test/${next++}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void blobs.delete(url));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    if (!blob || !this.download) return;
    const file = { name: this.download, blob };
    saves.push(file);
    onSave?.(file);
  });
  return saves;
}
