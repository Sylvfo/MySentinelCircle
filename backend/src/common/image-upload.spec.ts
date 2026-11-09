import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectImageExtension, finalizeImageUpload } from './image-upload';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
]);

describe('detectImageExtension', () => {
  it.each([
    [JPEG, '.jpg'],
    [PNG, '.png'],
    [WEBP, '.webp'],
  ])('recognizes a real image by its first bytes', (bytes, ext) => {
    expect(detectImageExtension(bytes)).toBe(ext);
  });

  it('rejects anything else, whatever its name or declared type', () => {
    expect(detectImageExtension(Buffer.from('<html><script>'))).toBeNull();
    expect(detectImageExtension(Buffer.from('GIF89a......'))).toBeNull();
  });
});

describe('finalizeImageUpload', () => {
  const upload = async (bytes: Buffer) => {
    const dir = await mkdtemp(join(tmpdir(), 'upload-'));
    await writeFile(join(dir, 'abc'), bytes);
    return {
      dir,
      file: {
        path: join(dir, 'abc'),
        destination: dir,
        filename: 'abc',
      } as Express.Multer.File,
    };
  };

  it('renames a real image with the extension its bytes say', async () => {
    const { dir, file } = await upload(PNG);
    await expect(finalizeImageUpload(file)).resolves.toBe('abc.png');
    expect(await readdir(dir)).toEqual(['abc.png']);
  });

  it('deletes and rejects a fake image', async () => {
    const { dir, file } = await upload(
      Buffer.from('<html>not an image</html>'),
    );
    await expect(finalizeImageUpload(file)).rejects.toThrow(
      BadRequestException,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it('rejects a request with no file', async () => {
    await expect(finalizeImageUpload(undefined)).rejects.toThrow(
      BadRequestException,
    );
  });
});
