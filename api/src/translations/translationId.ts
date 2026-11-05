import { isDocumentExtension, isImageExtension } from '@lingo-lens/shared';
import { GUID_PATTERN } from './http';

/**
 * Everything the stateless backend needs to find a Translation again, carried
 * in the opaque id the SPA holds (spec: "an opaque token combining our GUID and
 * Azure's operation id"). It is not secret: it is only base64url JSON, and every
 * field is validated on the way back in.
 *
 * Ticket 05 adds `kind: 'image'` (operationId = the Document Intelligence
 * analyze id). Ticket 09 reads `startedAt` for the timeouts.
 */
export interface TranslationRef {
  kind: 'document' | 'image';
  /** Our GUID; names every blob of the Translation. */
  guid: string;
  /** Source file extension (lower case). */
  extension: string;
  /** Azure's operation id (batch job id, or analyze result id). */
  operationId: string;
  /** When `POST /api/translations` started it. */
  startedAt: Date;
}

interface Wire {
  v: 1;
  k: 'd' | 'i';
  g: string;
  e: string;
  o: string;
  /** Epoch milliseconds. */
  s: number;
}

const OPERATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function encodeTranslationId(ref: TranslationRef): string {
  const wire: Wire = {
    v: 1,
    k: ref.kind === 'document' ? 'd' : 'i',
    g: ref.guid,
    e: ref.extension,
    o: ref.operationId,
    s: ref.startedAt.getTime(),
  };
  return Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
}

/** The Translation an id refers to, or undefined if the id is malformed or tampered with. */
export function decodeTranslationId(id: string | undefined): TranslationRef | undefined {
  if (!id || id.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(id)) return undefined;
  let wire: Partial<Wire>;
  try {
    wire = JSON.parse(Buffer.from(id, 'base64url').toString('utf8')) as Partial<Wire>;
  } catch {
    return undefined;
  }
  if (wire === null || typeof wire !== 'object' || wire.v !== 1) return undefined;
  const { k, g, e, o, s } = wire;
  if (k !== 'd' && k !== 'i') return undefined;
  if (typeof g !== 'string' || !GUID_PATTERN.test(g)) return undefined;
  if (typeof e !== 'string' || !(k === 'd' ? isDocumentExtension(e) : isImageExtension(e))) return undefined;
  if (typeof o !== 'string' || !OPERATION_ID.test(o)) return undefined;
  if (typeof s !== 'number' || !Number.isFinite(s)) return undefined;
  return { kind: k === 'd' ? 'document' : 'image', guid: g, extension: e, operationId: o, startedAt: new Date(s) };
}
