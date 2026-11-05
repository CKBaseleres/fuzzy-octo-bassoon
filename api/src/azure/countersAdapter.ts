import { RestError, TableClient } from '@azure/data-tables';
import type { TokenCredential } from '@azure/identity';
import { AzureServiceError, type CounterKey, type CounterPort } from './port';

/** Concurrent increments of one row retry this many times before giving up. */
const MAX_ATTEMPTS = 8;

interface CounterEntity {
  count: number;
}

function toAzureError(error: unknown): never {
  if (error instanceof RestError) {
    throw new AzureServiceError({
      service: 'counters',
      httpStatus: error.statusCode ?? 0,
      code: error.code,
      message: error.message.slice(0, 300),
    });
  }
  throw error;
}

const statusOf = (error: unknown) => (error instanceof RestError ? error.statusCode : undefined);

/**
 * Quota counters in Table Storage through the Function App's managed identity
 * (Storage Table Data Contributor; shared keys are disabled). One entity per
 * counter, holding only `count`. Increments use optimistic concurrency: insert
 * when missing (409 -> someone else did, retry), otherwise replace with the
 * read ETag (412 -> someone else did, retry).
 */
export function createCountersAdapter(config: {
  tableEndpoint: string;
  tableName: string;
  credential: TokenCredential;
}): CounterPort {
  const table = new TableClient(config.tableEndpoint, config.tableName, config.credential);

  async function read({ partitionKey, rowKey }: CounterKey) {
    try {
      const entity = await table.getEntity<CounterEntity>(partitionKey, rowKey, { queryOptions: { select: ['count'] } });
      return { count: Number(entity.count) || 0, etag: entity.etag };
    } catch (error) {
      if (statusOf(error) === 404) return undefined;
      return toAzureError(error);
    }
  }

  return {
    async get(key) {
      return (await read(key))?.count ?? 0;
    },

    async increment(key) {
      for (let attempt = 1; ; attempt++) {
        const current = await read(key);
        const next = (current?.count ?? 0) + 1;
        try {
          if (current) {
            await table.updateEntity({ ...key, count: next }, 'Replace', { etag: current.etag });
          } else {
            await table.createEntity({ ...key, count: next });
          }
          return next;
        } catch (error) {
          const conflict = statusOf(error) === 409 || statusOf(error) === 412;
          if (!conflict || attempt >= MAX_ATTEMPTS) return toAzureError(error);
        }
      }
    },
  };
}
