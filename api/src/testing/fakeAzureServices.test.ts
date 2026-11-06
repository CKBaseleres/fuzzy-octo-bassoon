import { describe, expect, it } from 'vitest';
import { AzureServiceError } from '../azure/port';
import { createFakeAzureServices } from './fakeAzureServices';
import { createFakeClock } from './fakeClock';

// The fake is the shared test double for every Seam 1 test, so its scripting
// contract is pinned here.
describe('fake Azure services', () => {
  const create = () => createFakeAzureServices({ clock: createFakeClock() });

  it('returns a scripted status on every call until rescripted', async () => {
    const azure = create();
    const { operationId } = await azure.documentTranslation.startBatch({
      sourceBlobName: 'a.docx',
      targetBlobName: 'b.docx',
      targetLanguage: 'fr',
    });

    azure.script('documentTranslation', 'getBatchStatus').resolves({
      status: 'Failed',
      document: { status: 'Failed', error: { code: 'InvalidRequest', innerErrorCode: 'WrongDocumentEncoding' } },
    });

    const expected = {
      status: 'Failed',
      document: { status: 'Failed', error: { code: 'InvalidRequest', innerErrorCode: 'WrongDocumentEncoding' } },
    };
    expect(await azure.documentTranslation.getBatchStatus(operationId)).toEqual(expected);
    expect(await azure.documentTranslation.getBatchStatus(operationId)).toEqual(expected);
  });

  it('throws a scripted Azure error payload once, then behaves normally', async () => {
    const azure = create();
    azure
      .script('textTranslation', 'translate')
      .rejectsOnce(new AzureServiceError({ service: 'textTranslation', httpStatus: 429, code: '429001' }));

    const failure = azure.textTranslation.translate({ texts: ['Hello'], targetLanguage: 'fr' });
    await expect(failure).rejects.toMatchObject({ service: 'textTranslation', httpStatus: 429, code: '429001' });

    expect(await azure.textTranslation.translate({ texts: ['Hello'], targetLanguage: 'fr' })).toEqual([
      { text: '[fr] Hello', detectedLanguage: 'en' },
    ]);
  });

  it('plays once-only scripts in order before falling back to the standing script', async () => {
    const azure = create();
    const script = azure.script('documentIntelligence', 'getReadResult');
    script.resolves({ status: 'succeeded', result: { page: { width: 10, height: 20 }, paragraphs: [], isHandwritten: false } });
    script.resolvesOnce({ status: 'notStarted' }).resolvesOnce({ status: 'running' });

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await azure.documentIntelligence.getReadResult('read-x')).status);

    expect(statuses).toEqual(['notStarted', 'running', 'succeeded']);
  });

  it('lets a script compute its answer from the call arguments', async () => {
    const azure = create();
    azure
      .script('blobs', 'getBlob')
      .handles((name) => Promise.resolve({ name, sizeInBytes: 41 * 1024 * 1024, createdOn: new Date(0) }));

    expect(await azure.blobs.getBlob('big.pdf')).toMatchObject({ name: 'big.pdf', sizeInBytes: 42991616 });
  });
});
