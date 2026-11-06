import type { ApiErrorResponse, CreateUploadResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { createTestApi } from '../testing/testApi';
import { createUploadHandler } from './createUpload';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('POST /api/translations/uploads', () => {
  const request = (body: unknown) => ({ method: 'POST' as const, path: '/api/translations/uploads', body });

  it('returns a new GUID and a write-only SAS for one GUID-named blob that keeps the extension, expiring in 10 minutes', async () => {
    const api = createTestApi({ now: '2026-11-05T09:00:00.000Z' });

    const response = await api.call(createUploadHandler, request({ extension: 'pdf' }));

    expect(response.status).toBe(200);
    const body = response.json<CreateUploadResponse>();
    expect(body.translationGuid).toMatch(GUID);
    expect(body.expiresOn).toBe('2026-11-05T09:10:00.000Z');
    const url = new URL(body.uploadUrl);
    expect(url.pathname).toBe(`/source/${body.translationGuid}/file.pdf`);
    expect(url.searchParams.get('sp')).toBe('w');
    expect(url.searchParams.get('se')).toBe('2026-11-05T09:10:00.000Z');
  });

  it('gives every upload its own GUID', async () => {
    const api = createTestApi();

    const first = (await api.call(createUploadHandler, request({ extension: 'docx' }))).json<CreateUploadResponse>();
    const second = (await api.call(createUploadHandler, request({ extension: 'docx' }))).json<CreateUploadResponse>();

    expect(first.translationGuid).not.toBe(second.translationGuid);
  });

  it('normalises the extension to lower case', async () => {
    const api = createTestApi();

    const body = (await api.call(createUploadHandler, request({ extension: 'DOCX' }))).json<CreateUploadResponse>();

    expect(new URL(body.uploadUrl).pathname).toMatch(/\/file\.docx$/);
  });

  it.each([{ extension: 'exe' }, { extension: '../x' }, { extension: '' }, {}, { extension: 7 }])(
    'refuses an unsupported or missing extension %j',
    async (body) => {
      const api = createTestApi();

      const response = await api.call(createUploadHandler, request(body));

      expect(response.status).toBe(400);
      expect(response.json<ApiErrorResponse>().error).toBe('badRequest');
    },
  );

  it('logs only the GUID and format', async () => {
    const api = createTestApi();

    const body = (await api.call(createUploadHandler, request({ extension: 'pdf' }))).json<CreateUploadResponse>();

    expect(api.logs).toContainEqual({
      level: 'information',
      args: ['upload.created', { translationGuid: body.translationGuid, format: 'pdf' }],
    });
    expect(JSON.stringify(api.logs)).not.toContain('sig=');
  });
});
