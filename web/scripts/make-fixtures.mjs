// Generates the small fixture files the Seam 2 browser-check tests pick
// (web/src/test/fixtures). Run from the repo root: `node web/scripts/make-fixtures.mjs`.
// The output is committed; re-run only to change a fixture.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'test', 'fixtures');
mkdirSync(out, { recursive: true });
const write = (name, bytes) => writeFileSync(join(out, name), bytes);

// --- Office Open XML -------------------------------------------------------

/** A ZIP archive with stored (uncompressed) entries. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

write(
  'plain.docx',
  zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>',
    ],
  ]),
);

// An encrypted OOXML file is an OLE Compound File (EncryptionInfo + EncryptedPackage
// streams). Only the 512-byte CFB header matters to the browser check.
function cfbHeader() {
  const header = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24); // minor version
  header.writeUInt16LE(0x0003, 26); // major version 3
  header.writeUInt16LE(0xfffe, 28); // little-endian byte order
  header.writeUInt16LE(9, 30); // 512-byte sectors
  header.writeUInt16LE(6, 32); // 64-byte mini sectors
  header.writeUInt32LE(0xfffffffe, 60); // no mini FAT
  header.writeUInt32LE(0xfffffffe, 68); // no DIFAT
  header.fill(0xff, 76);
  return header;
}
write('encrypted.docx', cfbHeader());

// --- PDF ---------------------------------------------------------------------

function pdf(trailerExtra, extraObjects = []) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    ...extraObjects,
  ];
  let body = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) body += `${String(at).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
write('plain.pdf', pdf(''));
write(
  'encrypted.pdf',
  pdf(' /Encrypt 5 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]', [
    '<< /Filter /Standard /V 2 /R 3 /Length 128 /O <00> /U <00> /P -4 >>',
  ]),
);

// --- Images (headers only: the browser check reads the size, not the pixels) -----

function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
write('photo-200x120.png', png(200, 120));
write('tiny-40x40.png', png(40, 40));

function jpeg(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof0 = Buffer.from([0xff, 0xc0, 0x00, 0x11, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, Buffer.from([0xff, 0xd9])]);
}
write('panorama-12000x800.jpg', jpeg(12000, 800));
write('photo-640x480.jpg', jpeg(640, 480));

function bmp(width, height) {
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'latin1');
  header.writeUInt32LE(54, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22); // negative = top-down rows
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  return header;
}
write('strip-30x-400.bmp', bmp(30, -400));

function tiff(width, height) {
  const entries = [
    [256, 4, width], // ImageWidth, LONG
    [257, 3, height], // ImageLength, SHORT
  ];
  const ifd = Buffer.alloc(2 + entries.length * 12 + 4);
  ifd.writeUInt16BE(entries.length, 0);
  entries.forEach(([tag, type, value], i) => {
    const at = 2 + i * 12;
    ifd.writeUInt16BE(tag, at);
    ifd.writeUInt16BE(type, at + 2);
    ifd.writeUInt32BE(1, at + 4);
    if (type === 3) ifd.writeUInt16BE(value, at + 8);
    else ifd.writeUInt32BE(value, at + 8);
  });
  const header = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]); // big-endian, IFD at 8
  return Buffer.concat([header, ifd]);
}
write('scan-20000x300.tif', tiff(20000, 300));

function box(type, ...payload) {
  const data = Buffer.concat(payload);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + data.length);
  return Buffer.concat([size, Buffer.from(type, 'latin1'), data]);
}
function heic(sizes) {
  const ispe = ([width, height]) => {
    const dims = Buffer.alloc(12);
    dims.writeUInt32BE(width, 4);
    dims.writeUInt32BE(height, 8);
    return box('ispe', dims);
  };
  const ftyp = box('ftyp', Buffer.from('heic\0\0\0\0mif1heic', 'latin1'));
  const ipco = box('ipco', ...sizes.map(ispe));
  const meta = box('meta', Buffer.alloc(4), box('iprp', ipco));
  return Buffer.concat([ftyp, meta]);
}
// The 4032x3024 photo also carries a 320x240 thumbnail: the largest size is what counts.
write('icon-48x48.heic', heic([[48, 48]]));
write('photo-4032x3024.heic', heic([[320, 240], [4032, 3024]]));
