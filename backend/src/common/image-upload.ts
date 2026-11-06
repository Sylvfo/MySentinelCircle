import { BadRequestException } from '@nestjs/common';
import { open, rename, unlink } from 'fs/promises';
import { join } from 'path';

// Uploaded images: the MIME type and file name come from the client and can
// be faked (e.g. "page.html" declared as image/png). So once multer has
// written the file, we read its first bytes ("magic number") to know what it
// really is, and give it an extension we chose ourselves.
const SIGNATURES: { ext: string; matches: (b: Buffer) => boolean }[] = [
  {
    ext: '.jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: '.png',
    matches: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: '.webp',
    matches: (b) =>
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export function detectImageExtension(head: Buffer): string | null {
  return SIGNATURES.find((s) => s.matches(head))?.ext ?? null;
}

// Checks the uploaded file really is a jpg/png/webp image, renames it to
// "<its random name>.<real extension>" and returns the new file name.
// Anything else is deleted and rejected with a 400.
export async function finalizeImageUpload(
  file: Express.Multer.File | undefined,
): Promise<string> {
  if (!file) throw new BadRequestException('No image received');
  const head = Buffer.alloc(12);
  const handle = await open(file.path, 'r');
  try {
    await handle.read(head, 0, 12, 0);
  } finally {
    await handle.close();
  }
  const ext = detectImageExtension(head);
  if (!ext) {
    await unlink(file.path).catch(() => undefined);
    throw new BadRequestException('Only jpg/png/webp images are allowed');
  }
  const filename = `${file.filename}${ext}`;
  await rename(file.path, join(file.destination, filename));
  return filename;
}
