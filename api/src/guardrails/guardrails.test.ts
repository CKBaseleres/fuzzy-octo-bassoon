import type { CreateUploadResponse, RefusedResponse, TooLargeResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { createUploadHandler } from '../functions/createUpload';
import { createHealthHandler } from '../functions/health';
import { createStartTranslationHandler } from '../functions/startTranslation';
import { createTestApi, type TestApi } from '../testing/testApi';

const requestUpload = (ip = '203.0.113.7', extension = 'pdf') => ({
  method: 'POST' as const,
  path: '/api/translations/uploads',
  headers: { 'x-forwarded-for': ip },
  body: { extension },
});

/** What the SPA does: upload SAS, PUT the Source file, start. Returns the start response (or the refused upload). */
async function translate(api: TestApi, { ip = '203.0.113.7', extension = 'pdf', sizeInBytes = 1000 } = {}) {
  const upload = await api.call(createUploadHandler, requestUpload(ip, extension));
  if (upload.status !== 200) return upload;
  const { translationGuid, uploadUrl } = upload.json<CreateUploadResponse>();
  api.azure.state.putBlob(new URL(uploadUrl).pathname.slice(1), sizeInBytes);
  return api.call(createStartTranslationHandler, {
    method: 'POST',
    path: '/api/translations',
    headers: { 'x-forwarded-for': ip },
    body: { translationGuid, extension, targetLanguage: 'fr' },
  });
}

async function translateTimes(api: TestApi, times: number, options?: Parameters<typeof translate>[1]) {
  for (let i = 0; i < times; i++) {
    const response = await translate(api, options);
    expect(response.status, `Translation ${i + 1}`).toBe(202);
  }
}

describe('daily quota', () => {
  it('refuses the Translation after the quota, across all IPs, until UTC midnight', async () => {
    const api = createTestApi({ now: '2026-11-05T21:00:00.000Z', limits: { dailyQuota: 3 } });
    await translateTimes(api, 1, { ip: '198.51.100.1' });
    await translateTimes(api, 2, { ip: '198.51.100.2' });

    const refusedResponse = await translate(api, { ip: '198.51.100.3' });

    expect(refusedResponse.status).toBe(429);
    expect(refusedResponse.headers.get('retry-after')).toBe(String(3 * 3600));
    expect(refusedResponse.json<RefusedResponse>()).toEqual({ error: 'refused', limit: 'daily' });
  });

  it('allows Translations again from UTC midnight', async () => {
    const api = createTestApi({ now: '2026-11-05T23:59:59.000Z', limits: { dailyQuota: 1 } });
    await translateTimes(api, 1);
    expect((await translate(api, { ip: '198.51.100.9' })).status).toBe(429);

    api.clock.set('2026-11-06T00:00:00.000Z');

    expect((await translate(api, { ip: '198.51.100.9' })).status).toBe(202);
  });
});

describe('hourly limit per IP', () => {
  it('refuses a client IP after its hourly limit until the next full hour, telling it how long to wait', async () => {
    const api = createTestApi({ now: '2026-11-05T14:47:30.000Z', limits: { hourlyPerIpQuota: 2 } });
    await translateTimes(api, 2, { ip: '203.0.113.7' });

    const refusedResponse = await translate(api, { ip: '203.0.113.7' });

    expect(refusedResponse.status).toBe(429);
    expect(refusedResponse.headers.get('retry-after')).toBe(String(12 * 60 + 30));
    expect(refusedResponse.json<RefusedResponse>()).toEqual({ error: 'refused', limit: 'hourly' });
  });

  it('keeps counting other IPs separately', async () => {
    const api = createTestApi({ now: '2026-11-05T14:00:00.000Z', limits: { hourlyPerIpQuota: 1 } });
    await translateTimes(api, 1, { ip: '203.0.113.7' });

    expect((await translate(api, { ip: '203.0.113.8' })).status).toBe(202);
    expect((await translate(api, { ip: '2001:db8::1' })).status).toBe(202);
  });

  it('allows the IP again from the next full hour', async () => {
    const api = createTestApi({ now: '2026-11-05T14:59:59.000Z', limits: { hourlyPerIpQuota: 1 } });
    await translateTimes(api, 1);
    expect((await translate(api)).status).toBe(429);

    api.clock.set('2026-11-05T15:00:00.000Z');

    expect((await translate(api)).status).toBe(202);
  });

  it('uses the client IP from X-Forwarded-For, ignoring its port and any proxies after it', async () => {
    const api = createTestApi({ now: '2026-11-05T14:00:00.000Z', limits: { hourlyPerIpQuota: 2 } });
    await translateTimes(api, 1, { ip: '203.0.113.7:51234' });
    await translateTimes(api, 1, { ip: '203.0.113.7, 10.0.0.4' });

    expect((await translate(api, { ip: '203.0.113.7' })).status).toBe(429);
  });

  it('reports the daily quota when both are used up', async () => {
    const api = createTestApi({ now: '2026-11-05T14:00:00.000Z', limits: { hourlyPerIpQuota: 1, dailyQuota: 1 } });
    await translateTimes(api, 1);

    expect((await translate(api)).json<RefusedResponse>().limit).toBe('daily');
  });
});

describe('what counts', () => {
  it('counts a Translation when it starts, even if it then fails', async () => {
    const api = createTestApi({ limits: { dailyQuota: 1 } });
    await translateTimes(api, 1);
    for (const job of api.azure.state.batchJobs.values()) job.status = 'Failed';

    expect((await translate(api)).status).toBe(429);
  });

  it('counts an Image Translation towards the quotas, like a Document', async () => {
    const api = createTestApi({ limits: { dailyQuota: 2, hourlyPerIpQuota: 5 } });

    expect((await translate(api, { extension: 'jpg' })).status).toBe(202);
    expect(api.azure.state.readOperations.size).toBe(1);
    expect((await translate(api, { extension: 'pdf' })).status).toBe(202);

    const refused = await translate(api, { extension: 'png' });
    expect(refused.status).toBe(429);
    expect(refused.json<RefusedResponse>()).toEqual({ error: 'refused', limit: 'daily' });
    expect(api.azure.state.readOperations.size).toBe(1);
  });

  it('does not count upload SASes that never led to a start, or starts without an uploaded file', async () => {
    const api = createTestApi({ limits: { dailyQuota: 1, hourlyPerIpQuota: 1 } });
    for (let i = 0; i < 3; i++) expect((await api.call(createUploadHandler, requestUpload())).status).toBe(200);
    const noFile = await api.call(createStartTranslationHandler, {
      method: 'POST',
      path: '/api/translations',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      body: { translationGuid: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', extension: 'pdf', targetLanguage: 'fr' },
    });
    expect(noFile.status).toBe(400);

    expect((await translate(api)).status).toBe(202);
  });

  it('refuses at start, and deletes the Source file, when the quota ran out after the upload SAS was issued', async () => {
    const api = createTestApi({ limits: { hourlyPerIpQuota: 1 } });
    const upload = await api.call(createUploadHandler, requestUpload());
    const { translationGuid, uploadUrl } = upload.json<CreateUploadResponse>();
    const sourceBlob = new URL(uploadUrl).pathname.slice(1);
    api.azure.state.putBlob(sourceBlob, 1000);
    await translateTimes(api, 1);

    const response = await api.call(createStartTranslationHandler, {
      method: 'POST',
      path: '/api/translations',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      body: { translationGuid, extension: 'pdf', targetLanguage: 'fr' },
    });

    expect(response.status).toBe(429);
    expect(response.json<RefusedResponse>().limit).toBe('hourly');
    expect(api.azure.state.blobs.has(sourceBlob)).toBe(false);
    expect(api.azure.state.batchJobs.size).toBe(1);
  });
});

describe('kill switch', () => {
  it('refuses an upload with 429 until the next UTC midnight when Translations are switched off', async () => {
    const api = createTestApi({ now: '2026-11-05T22:30:00.000Z', limits: { translationsEnabled: false } });

    const response = await api.call(createUploadHandler, requestUpload());

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe(String(90 * 60));
    expect(response.json<RefusedResponse>()).toEqual({ error: 'refused', limit: 'daily' });
  });

  it('refuses to start, and deletes the Source file, when Translations were switched off after the upload', async () => {
    const api = createTestApi({ now: '2026-11-05T12:00:00.000Z' });
    const upload = await api.call(createUploadHandler, requestUpload());
    const { translationGuid, uploadUrl } = upload.json<CreateUploadResponse>();
    const sourceBlob = new URL(uploadUrl).pathname.slice(1);
    api.azure.state.putBlob(sourceBlob, 1000);
    api.deps.limits.translationsEnabled = false;

    const response = await api.call(createStartTranslationHandler, {
      method: 'POST',
      path: '/api/translations',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      body: { translationGuid, extension: 'pdf', targetLanguage: 'fr' },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe(String(12 * 3600));
    expect(api.azure.state.blobs.has(sourceBlob)).toBe(false);
    expect(api.azure.state.batchJobs.size).toBe(0);
  });
});

describe('search engines', () => {
  it('marks every API response noindex, success or refusal', async () => {
    const api = createTestApi({ limits: { hourlyPerIpQuota: 0 } });
    const responses = [
      await api.call(createHealthHandler, { method: 'GET', path: '/api/health' }),
      await api.call(createUploadHandler, { method: 'POST', path: '/api/translations/uploads', body: { extension: 'exe' } }),
      await api.call(createUploadHandler, requestUpload()),
    ];

    expect(responses.map((r) => r.status)).toEqual([200, 400, 429]);
    for (const response of responses) expect(response.headers.get('x-robots-tag')).toBe('noindex');
  });
});

describe('server-side size check', () => {
  const MiB = 1024 * 1024;

  it.each([
    ['a Document', 'docx', 40 * MiB],
    ['an Image', 'png', 20 * MiB],
  ])('refuses %s over its limit with 413, deletes it at once and does not count it', async (_kind, extension, limit) => {
    const api = createTestApi({ limits: { dailyQuota: 1 } });

    const response = await translate(api, { extension, sizeInBytes: limit + 1 });

    expect(response.status).toBe(413);
    expect(response.json<TooLargeResponse>()).toEqual({ error: 'tooLarge', maxBytes: limit });
    expect([...api.azure.state.blobs.keys()]).toEqual([]);
    expect(api.azure.state.batchJobs.size).toBe(0);
    expect(api.azure.state.readOperations.size).toBe(0);
    expect((await translate(api)).status).toBe(202);
  });

  it('accepts a Document of exactly 40 MB', async () => {
    const api = createTestApi();

    expect((await translate(api, { extension: 'pdf', sizeInBytes: 40 * MiB })).status).toBe(202);
  });
});
