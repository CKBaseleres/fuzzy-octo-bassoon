import type { LanguagesResponse } from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';

/** GET /api/languages: every Translator target language, for the language picker. */
export const createGetLanguagesHandler: HttpHandlerFactory =
  ({ azure }) =>
  async () => {
    const languages = (await azure.textTranslation.listLanguages())
      .map(({ code, name }) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const body: LanguagesResponse = { languages };
    return { status: 200, jsonBody: body, headers: { 'cache-control': 'public, max-age=86400' } };
  };
