# Lingo Lens

An internal tool that lets staff translate files into another language while keeping their original layout.

## Language

**Source file**:
The file a user uploads to be translated; either a Document or an Image.
_Avoid_: Upload, input, attachment

**Document**:
A Source file whose structure (headings, paragraphs, tables, pages) carries meaning and must survive translation.
_Avoid_: File (when the kind matters), doc

**Image**:
A Source file that is a raster photo or scan, whose text must be read from pixels before it can be translated.
_Avoid_: Photo, picture, scan

**Translation**:
One run of a Source file from its source language into a single target language.
_Avoid_: Job, request, conversion

**Translated file**:
The output of a Translation: the Source file's content rendered in the target language.
_Avoid_: Result, output, translated document

**Completed**:
A Translation whose result the user received: the Translated file was saved, or, for an Image, the translated text was shown.
_Avoid_: Done, finished, successful

**Failed**:
A Translation that could not produce a Translated file, because the Source file could not be translated or the service did not respond.
_Avoid_: Errored, broken

**Expired**:
A Translation whose files were deleted after the one-hour time limit, before the user saved the Translated file.
_Avoid_: Timed out, stale

**Abandoned**:
A Translation the user left before saving the Translated file, for example by refreshing or closing the page.
_Avoid_: Cancelled, lost
