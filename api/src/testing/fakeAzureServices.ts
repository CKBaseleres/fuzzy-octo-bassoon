import type { Clock } from '../clock';
import {
  AzureServiceError,
  type AzureServiceName,
  type AzureServices,
  type BatchStatus,
  type BlobInfo,
  type ReadOperation,
} from '../azure/port';

export interface FakeBatchJob extends BatchStatus {
  request: { sourceBlobName: string; targetBlobName: string; targetLanguage: string };
}

export interface FakeReadOperation extends ReadOperation {
  sourceUrl: string;
  /** Set once `deleteReadResult` has been called for it. */
  resultDeleted: boolean;
}

/**
 * In-memory Azure. Tests arrange and inspect it through `state`; anything
 * not arranged behaves like a healthy Azure.
 */
export interface FakeAzureState {
  blobs: Map<string, BlobInfo>;
  /** Keyed by `${partitionKey}|${rowKey}`. */
  counters: Map<string, number>;
  batchJobs: Map<string, FakeBatchJob>;
  readOperations: Map<string, FakeReadOperation>;
  /** Simulates the browser uploading a Source file straight to Blob Storage. */
  putBlob(name: string, sizeInBytes: number, createdOn?: Date): void;
}

type AnyAsyncFn = (...args: never[]) => Promise<unknown>;
export type PortMethod<S extends AzureServiceName> = {
  [M in keyof AzureServices[S]]: AzureServices[S][M] extends AnyAsyncFn ? M : never;
}[keyof AzureServices[S]] &
  string;
type MethodOf<S extends AzureServiceName, M extends PortMethod<S>> = AzureServices[S][M] extends (
  ...args: infer A
) => Promise<infer R>
  ? { args: A; result: R }
  : never;

/**
 * Overrides one port method. Once-only answers play first, in order; then the
 * standing answer (`resolves`/`rejects`/`handles`); then the in-memory default.
 */
export interface MethodScript<A extends unknown[], R> {
  resolves(value: R): this;
  resolvesOnce(value: R): this;
  /** Usually an `AzureServiceError` carrying the payload under test. */
  rejects(error: Error): this;
  rejectsOnce(error: Error): this;
  handles(fn: (...args: A) => Promise<R>): this;
  handlesOnce(fn: (...args: A) => Promise<R>): this;
  /** Drops every scripted answer for this method. */
  reset(): this;
}

export interface FakeAzureServices extends AzureServices {
  state: FakeAzureState;
  script<S extends AzureServiceName, M extends PortMethod<S>>(
    service: S,
    method: M,
  ): MethodScript<MethodOf<S, M>['args'], MethodOf<S, M>['result']>;
}

type Answer = (...args: unknown[]) => Promise<unknown>;
interface ScriptState {
  once: Answer[];
  standing: Answer | undefined;
}

export function createFakeAzureServices({ clock }: { clock: Clock }): FakeAzureServices {
  const services = createInMemoryServices(clock);
  const scripts = new Map<string, ScriptState>();
  const scriptFor = (key: string) => {
    let s = scripts.get(key);
    if (!s) scripts.set(key, (s = { once: [], standing: undefined }));
    return s;
  };

  // Route every port method through its script before the in-memory default.
  const scripted = {} as Record<string, Record<string, Answer>>;
  for (const [service, port] of Object.entries(services.ports)) {
    const methods = port as unknown as Record<string, Answer>;
    scripted[service] = Object.fromEntries(
      Object.entries(methods).map(([method, original]) => {
        const key = `${service}.${method}`;
        const wrapped: Answer = (...args) => {
          const s = scripts.get(key);
          const answer = s?.once.shift() ?? s?.standing ?? original;
          return answer(...args);
        };
        return [method, wrapped];
      }),
    );
  }

  return {
    ...(scripted as unknown as AzureServices),
    state: services.state,
    script(service, method) {
      const s = scriptFor(`${service}.${method}`);
      const api: MethodScript<unknown[], unknown> = {
        resolves: (value) => ((s.standing = () => Promise.resolve(value)), api),
        resolvesOnce: (value) => (s.once.push(() => Promise.resolve(value)), api),
        rejects: (error) => ((s.standing = () => Promise.reject(error)), api),
        rejectsOnce: (error) => (s.once.push(() => Promise.reject(error)), api),
        handles: (fn) => ((s.standing = fn), api),
        handlesOnce: (fn) => (s.once.push(fn), api),
        reset: () => ((s.once = []), (s.standing = undefined), api),
      };
      return api;
    },
  };
}

function createInMemoryServices(clock: Clock): { state: FakeAzureState; ports: AzureServices } {
  const blobs = new Map<string, BlobInfo>();
  const counters = new Map<string, number>();
  const batchJobs = new Map<string, FakeBatchJob>();
  const readOperations = new Map<string, FakeReadOperation>();
  let nextId = 1;

  const notFound = (service: 'documentTranslation' | 'documentIntelligence', id: string) =>
    new AzureServiceError({ service, httpStatus: 404, code: 'NotFound', message: `No operation ${id}` });

  const state: FakeAzureState = {
    blobs,
    counters,
    batchJobs,
    readOperations,
    putBlob(name, sizeInBytes, createdOn = clock.now()) {
      blobs.set(name, { name, sizeInBytes, createdOn });
    },
  };

  const sasUrl = (blobName: string, permission: 'w' | 'r', expiresOn: Date) =>
    `https://fake.blob.core.windows.net/${blobName}?sp=${permission}&se=${encodeURIComponent(expiresOn.toISOString())}&sig=fake`;

  const ports: AzureServices = {
    documentTranslation: {
      startBatch: (request) => {
        const operationId = `batch-${nextId++}`;
        batchJobs.set(operationId, { status: 'NotStarted', request });
        return Promise.resolve({ operationId });
      },
      getBatchStatus: (operationId) => {
        const job = batchJobs.get(operationId);
        if (!job) return Promise.reject(notFound('documentTranslation', operationId));
        const { request: _request, ...status } = job;
        return Promise.resolve(status);
      },
      cancelBatch: (operationId) => {
        const job = batchJobs.get(operationId);
        if (!job) return Promise.reject(notFound('documentTranslation', operationId));
        job.status = 'Cancelled';
        return Promise.resolve();
      },
    },

    documentIntelligence: {
      startRead: ({ sourceUrl }) => {
        const operationId = `read-${nextId++}`;
        readOperations.set(operationId, { status: 'running', sourceUrl, resultDeleted: false });
        return Promise.resolve({ operationId });
      },
      getReadResult: (operationId) => {
        const op = readOperations.get(operationId);
        if (!op || op.resultDeleted) return Promise.reject(notFound('documentIntelligence', operationId));
        const { sourceUrl: _sourceUrl, resultDeleted: _deleted, ...result } = op;
        return Promise.resolve(result);
      },
      deleteReadResult: (operationId) => {
        const op = readOperations.get(operationId);
        if (!op) return Promise.reject(notFound('documentIntelligence', operationId));
        op.resultDeleted = true;
        return Promise.resolve();
      },
    },

    textTranslation: {
      // A recognisable stand-in translation: "[fr] Hello" for "Hello" into fr.
      translate: ({ texts, targetLanguage }) =>
        Promise.resolve(texts.map((text) => ({ text: `[${targetLanguage}] ${text}`, detectedLanguage: 'en' }))),
    },

    blobs: {
      createUploadUrl: (blobName, expiresOn) => Promise.resolve(sasUrl(blobName, 'w', expiresOn)),
      createReadUrl: (blobName, expiresOn) => Promise.resolve(sasUrl(blobName, 'r', expiresOn)),
      getBlob: (blobName) => Promise.resolve(blobs.get(blobName)),
      listBlobs: (prefix = '') => Promise.resolve([...blobs.values()].filter((b) => b.name.startsWith(prefix))),
      deleteBlob: (blobName) => {
        blobs.delete(blobName);
        return Promise.resolve();
      },
    },

    counters: {
      get: ({ partitionKey, rowKey }) => Promise.resolve(counters.get(`${partitionKey}|${rowKey}`) ?? 0),
      increment: ({ partitionKey, rowKey }) => {
        const key = `${partitionKey}|${rowKey}`;
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return Promise.resolve(next);
      },
    },
  };

  return { state, ports };
}
