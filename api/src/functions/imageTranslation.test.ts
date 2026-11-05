import type { StartTranslationResponse, TranslationStatusResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { AzureServiceError, type ReadResult } from '../azure/port';
import { startImageTranslation } from '../testing/imageTranslation';
import { createTestApi, type TestApi } from '../testing/testApi';
import { createDeleteTranslationHandler } from './deleteTranslation';
import { createGetTranslationHandler } from './getTranslation';
import { createStartTranslationHandler } from './startTranslation';

const UPLOAD_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const poll = (api: TestApi, id: string) =>
  api.call(createGetTranslationHandler, { method: 'GET', path: `/api/translations/${id}`, params: { id } });

const CAFE_SIGN: ReadResult = {
  page: { width: 1024, height: 768 },
  paragraphs: [
    { content: "Plat du jour", polygon: [102, 88, 470, 92, 469, 142, 101, 138] },
    { content: "Soupe à l'oignon 6 €", polygon: [96, 190, 610, 196, 608, 252, 95, 246] },
  ],
  isHandwritten: true,
};

const start = (body: unknown) => ({ method: 'POST' as const, path: '/api/translations', body });

describe('Image Translation: POST /api/translations', () => {
  it('starts a prebuilt-read analyze of the uploaded Image through a 5-minute read-only SAS URL', async () => {
    const api = createTestApi({ now: '2026-03-01T10:00:00.000Z' });
    api.azure.state.putBlob(`source/${UPLOAD_ID}/file.jpg`, 300_000);

    const response = await api.call(
      createStartTranslationHandler,
      start({ uploadId: UPLOAD_ID, extension: 'jpg', targetLanguage: 'fr' }),
    );

    expect(response.status).toBe(202);
    expect(response.json<StartTranslationResponse>().id).toEqual(expect.any(String));
    const reads = [...api.azure.state.readOperations.values()];
    expect(reads).toHaveLength(1);
    const sourceUrl = new URL(reads[0]!.sourceUrl);
    expect(sourceUrl.pathname).toBe(`/source/${UPLOAD_ID}/file.jpg`);
    expect(sourceUrl.searchParams.get('sp')).toBe('r');
    expect(sourceUrl.searchParams.get('se')).toBe('2026-03-01T10:05:00.000Z');
    expect(api.azure.state.batchJobs.size).toBe(0);
  });
});

describe('Image Translation: GET /api/translations/{id}', () => {
  it.each(['notStarted', 'running'] as const)('reports translating while OCR is %s, keeping the Image', async (status) => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.read.status = status;

    const response = await poll(api, t.id);

    expect(response.status).toBe(200);
    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'translating' });
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(true);
  });

  it('once OCR succeeds, translates each paragraph and returns the page, paragraphs and handwriting flag', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api, { targetLanguage: 'en' });
    api.azure.script('textTranslation', 'translate').handles(({ texts, targetLanguage }) =>
      Promise.resolve(texts.map((text) => ({ text: `${targetLanguage}:${text}`, detectedLanguage: 'fr' }))),
    );
    t.succeed(CAFE_SIGN);

    const response = await poll(api, t.id);

    expect(response.status).toBe(200);
    expect(response.json<TranslationStatusResponse>()).toEqual({
      status: 'ready',
      kind: 'image',
      page: { width: 1024, height: 768 },
      paragraphs: [
        {
          polygon: [102, 88, 470, 92, 469, 142, 101, 138],
          original: 'Plat du jour',
          translation: 'en:Plat du jour',
          detectedLanguage: 'fr',
        },
        {
          polygon: [96, 190, 610, 196, 608, 252, 95, 246],
          original: "Soupe à l'oignon 6 €",
          translation: "en:Soupe à l'oignon 6 €",
          detectedLanguage: 'fr',
        },
      ],
      detectedLanguage: 'fr',
      isHandwritten: true,
    });
  });

  it('leaves nothing in Azure once the result is returned: the Image blob and the analyze result are deleted', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.succeed(CAFE_SIGN);

    await poll(api, t.id);

    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
    expect(api.azure.state.readOperations.get(t.operationId)!.resultDeleted).toBe(true);
  });

  it.each([
    ['more paragraphs than one call may carry', 2_345, () => 'Bonjour'],
    ['more characters than one call may carry', 7, () => 'x'.repeat(12_000)],
  ])('splits Translator calls when an Image has %s, matching every translation to its paragraph', async (_case, count, text) => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    const calls: string[][] = [];
    api.azure.script('textTranslation', 'translate').handles(({ texts }) => {
      const call = calls.push(texts);
      return Promise.resolve(texts.map((original) => ({ text: `call ${call}: ${original}`, detectedLanguage: 'fr' })));
    });
    const paragraphs = Array.from({ length: count }, (_, i) => ({ content: `${i}|${text()}`, polygon: [i, i, i + 1, i, i + 1, i + 1, i, i + 1] }));
    t.succeed({ page: { width: 4000, height: 3000 }, paragraphs, isHandwritten: false });

    const response = await poll(api, t.id);

    expect(calls.length).toBeGreaterThan(1);
    for (const texts of calls) {
      expect(texts.length).toBeLessThanOrEqual(1000);
      expect(texts.join('').length).toBeLessThanOrEqual(50_000);
    }
    const result = response.json<TranslationStatusResponse>();
    if (result.status !== 'ready' || result.kind !== 'image') throw new Error(`not an image result: ${result.status}`);
    expect(result.paragraphs).toHaveLength(count);
    result.paragraphs.forEach((p, i) => {
      expect(p.original).toBe(paragraphs[i]!.content);
      expect(p.polygon).toEqual(paragraphs[i]!.polygon);
      expect(p.translation).toMatch(new RegExp(`^call \\d+: ${i}\\|`));
    });
  });

  it('sends the paragraph texts with no source language, so Translator detects it', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api, { targetLanguage: 'de' });
    const requests: unknown[] = [];
    api.azure.script('textTranslation', 'translate').handles((request) => {
      requests.push(request);
      return Promise.resolve(request.texts.map((text) => ({ text, detectedLanguage: 'fr' })));
    });
    t.succeed(CAFE_SIGN);

    await poll(api, t.id);

    expect(requests).toEqual([{ texts: ['Plat du jour', "Soupe à l'oignon 6 €"], targetLanguage: 'de' }]);
  });

  it('keeps the Image and the analyze result when Translator fails, so the next poll can try again', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure
      .script('textTranslation', 'translate')
      .rejectsOnce(new AzureServiceError({ service: 'textTranslation', httpStatus: 503, code: 'ServiceUnavailable' }));
    t.succeed(CAFE_SIGN);

    await expect(poll(api, t.id)).rejects.toThrow();
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(true);
    expect(api.azure.state.readOperations.get(t.operationId)!.resultDeleted).toBe(false);

    const retried = await poll(api, t.id);
    expect(retried.json<TranslationStatusResponse>()).toMatchObject({ status: 'ready', kind: 'image' });
  });

  it('does not call Translator when no text was found', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure.script('textTranslation', 'translate').rejects(new Error('should not be called'));
    t.succeed({ page: { width: 800, height: 600 }, paragraphs: [], isHandwritten: false });

    const response = await poll(api, t.id);

    expect(response.status).toBe(200);
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
  });

  it.each(['failed', 'canceled'] as const)('reports failed when OCR is %s, and deletes the Image at once', async (status) => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.read.status = status;
    t.read.error = { code: 'InternalServerError' };

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toMatchObject({ status: 'failed' });
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
  });

  it('reports Expired once Document Intelligence no longer knows the analyze result', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.succeed(CAFE_SIGN);
    await poll(api, t.id);

    const later = await poll(api, t.id);

    expect(later.status).toBe(200);
    expect(later.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'expired' });
  });

  it('logs the end of the Translation with the detected language, and no text', async () => {
    const api = createTestApi({ now: '2026-03-01T10:00:00.000Z' });
    const t = await startImageTranslation(api, { extension: 'png' });
    api.azure.script('textTranslation', 'translate').handles(({ texts }) =>
      Promise.resolve(texts.map(() => ({ text: 'Dish of the day', detectedLanguage: 'fr' }))),
    );
    t.succeed(CAFE_SIGN);
    api.clock.advance(4_000);

    await poll(api, t.id);

    expect(api.logs).toContainEqual({
      level: 'information',
      args: [
        'translation.jobEnded',
        { translationGuid: t.guid, format: 'png', jobStatus: 'succeeded', detectedLanguage: 'fr', durationMs: 4_000 },
      ],
    });
    const logged = JSON.stringify(api.logs);
    expect(logged).not.toContain('Plat du jour');
    expect(logged).not.toContain('Dish of the day');
  });
});

describe('Image Translation: DELETE /api/translations/{id}', () => {
  const remove = (api: TestApi, id: string) =>
    api.call(createDeleteTranslationHandler, { method: 'DELETE', path: `/api/translations/${id}`, params: { id } });

  it('deletes the Image and the analyze result of a Translation still being read', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);

    const response = await remove(api, t.id);

    expect(response.status).toBe(204);
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
    expect(api.azure.state.readOperations.get(t.operationId)!.resultDeleted).toBe(true);
  });

  it('is safe after the result was already returned and deleted', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.succeed(CAFE_SIGN);
    await poll(api, t.id);
    api.azure
      .script('documentIntelligence', 'deleteReadResult')
      .rejects(new AzureServiceError({ service: 'documentIntelligence', httpStatus: 404, code: 'NotFound' }));

    const response = await remove(api, t.id);

    expect(response.status).toBe(204);
  });
});
