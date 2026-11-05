// Blob names are `<container>/<path>`. The real adapter splits on the first `/`.
// Paths carry only the server GUID and the extension (so Translator can detect
// the format): the original filename never reaches the backend.

export const SOURCE_CONTAINER = 'source';
export const TARGET_CONTAINER = 'target';

export const sourceBlobName = (guid: string, extension: string) => `${SOURCE_CONTAINER}/${guid}/file.${extension}`;
export const targetBlobName = (guid: string, extension: string) => `${TARGET_CONTAINER}/${guid}/file.${extension}`;

/** Every prefix under which a Translation's blobs can live. */
export const blobPrefixes = (guid: string) => [`${SOURCE_CONTAINER}/${guid}/`, `${TARGET_CONTAINER}/${guid}/`];
