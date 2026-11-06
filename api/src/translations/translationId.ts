import { isDocumentExtension, isImageExtension } from '@lingo-lens/shared';
import { GUID_PATTERN } from './http';

/**
 * Everything the stateless backend needs to find a Translation again, carried
 * in the opaque id the SPA holds (spec: "an opaque token combining our GUID and
 * Azure's operation id"). It is not secret: it is only base64url JSON, and every
 * field is validated on the way back in.
 *
 * Images: `kind: 'image'`, operationId = the Document Intelligence analyze
 * result id, plus `targetLanguage`. Ticket 09 reads `startedAt` for the timeouts.
 */
export type TranslationRef = DocumentTranslationRef | ImageTranslationRef;

interface TranslationRefBase {
  /** Our GUID; names every blob of the Translation. */
  translationGuid: string;
  /** Source file extension (lower case). */
  extension: string;
  /** Azure's operation id (batch id, or analyze result id). */
  operationId: string;
  /** When `POST /api/translations` started it. */
  startedAt: Date;
}

/** A Document: the batch already knows its target language. */
export interface DocumentTranslationRef extends TranslationRefBase {
  kind: 'document';
}

export interface ImageTranslationRef extends TranslationRefBase {
  kind: 'image';
  /** The poll that sees OCR finish calls Translator text with it. */
  targetLanguage: string;
}

interface Wire {
  v: 1;
  k: 'd' | 'i';
  g: string;
  e: string;
  o: string;
  /** Epoch milliseconds. */
  s: number;
  /** Target language (Images only). */
  t?: string;
}

const OPERATION_ID = /^[A-Za-z0-9._-]{1,128}$/;
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

export function encodeTranslationId(ref: TranslationRef): string {
  const wire: Wire = {
    v: 1,
    k: ref.kind === 'document' ? 'd' : 'i',
    g: ref.translationGuid,
    e: ref.extension,
    o: ref.operationId,
    s: ref.startedAt.getTime(),
    ...(ref.kind === 'image' ? { t: ref.targetLanguage } : {}),
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
  const { k, g, e, o, s, t } = wire;
  if (k !== 'd' && k !== 'i') return undefined;
  if (typeof g !== 'string' || !GUID_PATTERN.test(g)) return undefined;
  if (typeof e !== 'string' || !(k === 'd' ? isDocumentExtension(e) : isImageExtension(e))) return undefined;
  if (typeof o !== 'string' || !OPERATION_ID.test(o)) return undefined;
  if (typeof s !== 'number' || !Number.isFinite(s)) return undefined;
  if (t !== undefined && (typeof t !== 'string' || !LANGUAGE_CODE.test(t))) return undefined;
  const base = { translationGuid: g, extension: e, operationId: o, startedAt: new Date(s) };
  if (k === 'd') return { kind: 'document', ...base };
  return t === undefined ? undefined : { kind: 'image', ...base, targetLanguage: t };
}
