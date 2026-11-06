import { describe, expect, it } from 'vitest';
import { dataUrlBytes, panoramaXmp, withXmp } from './xmp';

describe('360° photo-sphere metadata', () => {
  it('inserts a GPano XMP segment right after the JPEG start marker', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2, 3, 0xff, 0xd9]);
    const out = withXmp(jpeg, panoramaXmp(4096, 2048));
    expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    const len = (out[4]! << 8) | out[5]!;
    const segment = new TextDecoder().decode(out.subarray(6, 4 + len));
    expect(segment.startsWith('http://ns.adobe.com/xap/1.0/\0')).toBe(true);
    expect(segment).toContain('GPano:ProjectionType="equirectangular"');
    expect(segment).toContain('GPano:FullPanoWidthPixels="4096"');
    // The original image follows unchanged.
    expect([...out.subarray(4 + len)]).toEqual([...jpeg.subarray(2)]);
  });

  it('refuses non-JPEG data and decodes data URLs', () => {
    expect(() => withXmp(new Uint8Array([0x89, 0x50]), 'x')).toThrow();
    expect([...dataUrlBytes('data:image/jpeg;base64,/9g=')]).toEqual([0xff, 0xd8]);
  });
});
