/**
 * Photo-sphere metadata (Google "GPano" XMP) so 360° viewers — Google Photos, Facebook, most
 * panorama apps — open an equirectangular JPEG as an interactive panorama.
 */
export function panoramaXmp(width: number, height: number): string {
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/"' +
    ' GPano:ProjectionType="equirectangular" GPano:UsePanoramaViewer="True"' +
    ` GPano:FullPanoWidthPixels="${width}" GPano:FullPanoHeightPixels="${height}"` +
    ` GPano:CroppedAreaImageWidthPixels="${width}" GPano:CroppedAreaImageHeightPixels="${height}"` +
    ' GPano:CroppedAreaLeftPixels="0" GPano:CroppedAreaTopPixels="0"/>' +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  );
}

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

/** Insert an XMP APP1 segment right after the JPEG start-of-image marker. */
export function withXmp(jpeg: Uint8Array, xmp: string): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  const payload = new TextEncoder().encode(XMP_HEADER + xmp);
  const length = payload.length + 2;
  if (length > 0xffff) throw new Error('XMP too large');
  const out = new Uint8Array(jpeg.length + 4 + payload.length);
  out.set([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff], 0);
  out.set(payload, 6);
  out.set(jpeg.subarray(2), 6 + payload.length);
  return out;
}

/** "data:image/jpeg;base64,..." -> bytes. */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
