export const MAX_IMAGE_BYTES = 1024 * 1024;
export interface QuizImage {
  src: string;
  alt: string;
  caption?: string;
}

/** Only self-contained raster data; no remote requests, SVG, HTML or filesystem URLs. */
export function validateImageSource(
  src: string,
  maxBytes = MAX_IMAGE_BYTES,
): boolean {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match || src.length > Math.ceil(maxBytes / 3) * 4 + 64) return false;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  if (!bytes.length || bytes.length > maxBytes) return false;
  const text = (at: number, count: number) =>
    String.fromCharCode(...bytes.slice(at, at + count));
  const be16 = (at: number) => bytes[at] * 256 + bytes[at + 1];
  let width = 0,
    height = 0;
  if (match[1] === "png") {
    if (
      bytes.length < 24 ||
      text(0, 8) !== "\x89PNG\r\n\x1a\n" ||
      text(12, 4) !== "IHDR"
    )
      return false;
    const view = new DataView(bytes.buffer);
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (match[1] === "jpeg") {
    if (
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes.at(-2) !== 255 ||
      bytes.at(-1) !== 217
    )
      return false;
    let at = 2;
    while (at + 4 < bytes.length) {
      if (bytes[at++] !== 255) return false;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) break;
      const length = be16(at);
      if (length < 2 || at + length > bytes.length) return false;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        height = be16(at + 3);
        width = be16(at + 5);
        break;
      }
      at += length;
    }
  } else {
    if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP")
      return false;
    if (text(12, 4) === "VP8X") {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (text(12, 4) === "VP8L" && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height =
        1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    } else if (text(12, 4) === "VP8 " && text(23, 3) === "\x9d\x01\x2a") {
      width = (bytes[26] + (bytes[27] << 8)) & 16383;
      height = (bytes[28] + (bytes[29] << 8)) & 16383;
    }
  }
  return (
    width > 0 &&
    height > 0 &&
    width <= 8192 &&
    height <= 8192 &&
    width * height <= 16_777_216
  );
}
