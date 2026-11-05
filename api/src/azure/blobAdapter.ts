import type { TokenCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobServiceClient,
  RestError,
  SASProtocol,
  generateBlobSASQueryParameters,
  type UserDelegationKey,
} from '@azure/storage-blob';
import { AzureServiceError, type BlobPort } from './port';

/** A user delegation key is reused until it is this close to expiring. */
const KEY_LIFETIME_MS = 60 * 60_000;
const KEY_REFRESH_MARGIN_MS = 15 * 60_000;
/** Allows for clock skew between us and Storage. */
const SAS_START_SKEW_MS = 5 * 60_000;

/** `source/<guid>/file.pdf` -> container `source`, path `<guid>/file.pdf`. */
function split(blobName: string): { container: string; path: string } {
  const slash = blobName.indexOf('/');
  if (slash <= 0) throw new Error('Blob names must be <container>/<path>');
  return { container: blobName.slice(0, slash), path: blobName.slice(slash + 1) };
}

function toAzureError(error: unknown): never {
  if (error instanceof RestError) {
    throw new AzureServiceError({
      service: 'blobs',
      httpStatus: error.statusCode ?? 0,
      code: error.code,
      message: error.message.slice(0, 300),
    });
  }
  throw error;
}

/**
 * Blob Storage through the Function App's managed identity. SAS URLs are user
 * delegation SAS (account keys are disabled), scoped to one blob, HTTPS only.
 */
export function createBlobAdapter(options: {
  blobEndpoint: string;
  accountName: string;
  credential: TokenCredential;
}): BlobPort {
  const service = new BlobServiceClient(options.blobEndpoint, options.credential);
  let cachedKey: { key: UserDelegationKey; expiresOn: number } | undefined;

  async function delegationKey(sasExpiresOn: Date): Promise<UserDelegationKey> {
    const now = Date.now();
    if (!cachedKey || cachedKey.expiresOn - KEY_REFRESH_MARGIN_MS < Math.max(now, sasExpiresOn.getTime())) {
      const startsOn = new Date(now - SAS_START_SKEW_MS);
      const expiresOn = new Date(Math.max(now + KEY_LIFETIME_MS, sasExpiresOn.getTime() + KEY_REFRESH_MARGIN_MS));
      const key = await service.getUserDelegationKey(startsOn, expiresOn).catch(toAzureError);
      cachedKey = { key, expiresOn: expiresOn.getTime() };
    }
    return cachedKey.key;
  }

  async function sasUrl(blobName: string, permissions: string, expiresOn: Date): Promise<string> {
    const { container, path } = split(blobName);
    const key = await delegationKey(expiresOn);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName: path,
        permissions: BlobSASPermissions.parse(permissions),
        protocol: SASProtocol.Https,
        startsOn: new Date(Date.now() - SAS_START_SKEW_MS),
        expiresOn,
      },
      key,
      options.accountName,
    ).toString();
    return `${service.getContainerClient(container).getBlobClient(path).url}?${sas}`;
  }

  return {
    // create + write: enough for one Put Blob, no read, list or delete.
    createUploadUrl: (blobName, expiresOn) => sasUrl(blobName, 'cw', expiresOn),
    createReadUrl: (blobName, expiresOn) => sasUrl(blobName, 'r', expiresOn),

    async getBlob(blobName) {
      const { container, path } = split(blobName);
      try {
        const props = await service.getContainerClient(container).getBlobClient(path).getProperties();
        return { name: blobName, sizeInBytes: props.contentLength ?? 0, createdOn: props.createdOn ?? new Date(0) };
      } catch (error) {
        if (error instanceof RestError && error.statusCode === 404) return undefined;
        return toAzureError(error);
      }
    },

    async listBlobs(prefix) {
      const { container, path } = split(prefix);
      try {
        const found = [];
        for await (const blob of service.getContainerClient(container).listBlobsFlat({ prefix: path })) {
          found.push({
            name: `${container}/${blob.name}`,
            sizeInBytes: blob.properties.contentLength ?? 0,
            createdOn: blob.properties.createdOn ?? new Date(0),
          });
        }
        return found;
      } catch (error) {
        return toAzureError(error);
      }
    },

    async deleteBlob(blobName) {
      const { container, path } = split(blobName);
      await service.getContainerClient(container).getBlobClient(path).deleteIfExists().catch(toAzureError);
    },
  };
}
