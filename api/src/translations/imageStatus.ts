import type { ImageParagraph, TranslationStatusResponse } from '@lingo-lens/shared';
import type { AzureServices, ReadOperation, ReadResult, ReadStatus, TextTranslation } from '../azure/port';

/**
 * Translator text v3 `translate` request limits (Translator service limits:
 * "Character and array limits per request"): at most 1,000 array elements and
 * 50,000 characters in the whole request.
 */
export const TRANSLATE_MAX_ELEMENTS = 1000;
export const TRANSLATE_MAX_CHARACTERS = 50_000;

/** OCR states after which Document Intelligence no longer reads the Image. */
export const TERMINAL_READ_STATUSES: readonly ReadStatus[] = ['succeeded', 'failed', 'canceled'];

export const isReadTerminal = (status: ReadStatus) => TERMINAL_READ_STATUSES.includes(status);

/**
 * Maps an analyze operation that has not succeeded to what the SPA sees.
 * Happy path only: any failed or cancelled read is a Service problem.
 * Ticket 10 replaces the failed branch with the classifier (Image errors).
 */
export function mapReadStatus(read: ReadOperation): TranslationStatusResponse {
  switch (read.status) {
    case 'notStarted':
    case 'running':
      return { status: 'translating' };
    default:
      return { status: 'failed', category: 'serviceProblem' };
  }
}

/**
 * Splits texts into consecutive batches that each stay within Translator's
 * per-request limits. Order is kept, so results can be matched back by index.
 * A single text over the character limit still gets a batch of its own (OCR of
 * one Image page cannot realistically produce one).
 */
export function batchesWithinLimits(
  texts: readonly string[],
  maxElements = TRANSLATE_MAX_ELEMENTS,
  maxCharacters = TRANSLATE_MAX_CHARACTERS,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let characters = 0;
  for (const text of texts) {
    if (current.length > 0 && (current.length === maxElements || characters + text.length > maxCharacters)) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(text);
    characters += text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Translates every paragraph, split into calls within the limits, and zips the results back by index. */
export async function translateParagraphs(
  azure: AzureServices,
  result: ReadResult,
  targetLanguage: string,
): Promise<ImageParagraph[]> {
  const translations: TextTranslation[] = [];
  for (const texts of batchesWithinLimits(result.paragraphs.map((p) => p.content))) {
    const translated = await azure.textTranslation.translate({ texts, targetLanguage });
    if (translated.length !== texts.length) {
      throw new Error(`Translator returned ${translated.length} results for ${texts.length} texts`);
    }
    translations.push(...translated);
  }
  return result.paragraphs.map((paragraph, i) => {
    const translation = translations[i]!;
    return {
      polygon: paragraph.polygon,
      original: paragraph.content,
      translation: translation.text,
      ...(translation.detectedLanguage ? { detectedLanguage: translation.detectedLanguage } : {}),
    };
  });
}

/** The language most paragraphs were detected in (the first one wins a tie). */
export function mostCommonLanguage(paragraphs: readonly ImageParagraph[]): string | undefined {
  const counts = new Map<string, number>();
  let best: string | undefined;
  for (const { detectedLanguage } of paragraphs) {
    if (!detectedLanguage) continue;
    const count = (counts.get(detectedLanguage) ?? 0) + 1;
    counts.set(detectedLanguage, count);
    if (best === undefined || count > counts.get(best)!) best = detectedLanguage;
  }
  return best;
}
