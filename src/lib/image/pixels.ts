/**
 * The pixel stage of the import pipeline.
 *
 * The original app did this with `sharp` in a Node process. That library needs a
 * native binary and cannot run in this app's server runtime, so the work moved
 * into the browser, where Canvas 2D provides the same primitives: EXIF-aware
 * decode, crop, resize-to-fit, composite onto a transparent canvas, and direct
 * access to raw RGBA pixels.
 *
 * The algorithms below are a faithful port of the originals — same chroma-key
 * distance test, same feather width, same spill removal, same 1024px canvas at
 * 88% occupancy, same contamination check. Quality is unchanged. Doing it here
 * also means it costs nothing to run and never occupies server time.
 */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Same clamp as the original: the model reports boxes on a 0–1000 grid. */
export type BoundingBox = { x: number; y: number; width: number; height: number };

export type Raster = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not open a drawing canvas");
  return { canvas, context };
}

/** Decode honouring EXIF orientation, the equivalent of sharp's `.rotate()`. */
async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image", colorSpaceConversion: "default" });
}

export async function readRaster(blob: Blob): Promise<Raster> {
  const bitmap = await decode(blob);
  try {
    const { context } = canvasOf(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: image.data, width: image.width, height: image.height };
  } finally {
    bitmap.close();
  }
}

export function rasterToBlob(raster: Raster): Promise<Blob> {
  const { canvas, context } = canvasOf(raster.width, raster.height);
  context.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/png");
  });
}

/**
 * Normalize an upload the way the original did before anything else touched it:
 * upright, sRGB, PNG.
 */
export async function normalizeImage(file: Blob): Promise<Blob> {
  return rasterToBlob(await readRaster(file));
}

function normalizeBoundingBox(box: Partial<BoundingBox> = {}): BoundingBox {
  const number = (value: unknown, fallback: number) =>
    Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
  const x = Math.max(0, Math.min(999, number(box.x, 0)));
  const y = Math.max(0, Math.min(999, number(box.y, 0)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(1000 - x, number(box.width, 1000 - x))),
    height: Math.max(1, Math.min(1000 - y, number(box.height, 1000 - y))),
  };
}

/** Crop to a detected piece, with the original's 8% padding (minimum 12px). */
export async function cropDetectedItem(file: Blob, boundingBox: Partial<BoundingBox>): Promise<Blob> {
  const bitmap = await decode(file);
  try {
    const box = normalizeBoundingBox(boundingBox);
    const rawLeft = (box.x / 1000) * bitmap.width;
    const rawTop = (box.y / 1000) * bitmap.height;
    const rawWidth = (box.width / 1000) * bitmap.width;
    const rawHeight = (box.height / 1000) * bitmap.height;
    const padding = Math.max(12, Math.round(Math.max(rawWidth, rawHeight) * 0.08));
    const left = Math.max(0, Math.floor(rawLeft - padding));
    const top = Math.max(0, Math.floor(rawTop - padding));
    const right = Math.min(bitmap.width, Math.ceil(rawLeft + rawWidth + padding));
    const bottom = Math.min(bitmap.height, Math.ceil(rawTop + rawHeight + padding));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const { canvas, context } = canvasOf(width, height);
    context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop image"))), "image/png");
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Pick the chroma-key colour furthest from the piece's own primary colour, so the
 * key can never collide with the garment.
 */
export function chooseChromaKey(primary = "#808080"): string {
  const value = HEX_COLOR.test(primary) ? primary : "#808080";
  const source = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const candidates = [
    [0, 255, 0],
    [255, 0, 255],
    [0, 255, 255],
  ];
  const distance = (color: number[]) =>
    color.reduce((total, channel, index) => total + (channel - (source[index] ?? 0)) ** 2, 0);
  const selected = [...candidates].sort((a, b) => distance(b) - distance(a))[0]!;
  return `#${selected.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function cleanupTolerance(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(18, Math.min(110, Math.round(parsed))) : 46;
}

function keyChannels(key: string) {
  const target = [1, 3, 5].map((offset) => Number.parseInt(key.slice(offset, offset + 2), 16));
  return {
    target,
    keyed: target.map((channel, index) => (channel > 200 ? index : -1)).filter((index) => index >= 0),
    neutral: target.map((channel, index) => (channel < 55 ? index : -1)).filter((index) => index >= 0),
  };
}

function average(data: Uint8ClampedArray<ArrayBuffer>, index: number, channels: number[]): number {
  if (!channels.length) return 0;
  return channels.reduce((total, channel) => total + data[index + channel]!, 0) / channels.length;
}

/** Drain the keyed channels back down to the neutral level, as the original did. */
function removeKeyedSpill(
  data: Uint8ClampedArray<ArrayBuffer>,
  index: number,
  keyed: number[],
  neutralLevel: number,
): void {
  let remaining = Math.ceil(
    keyed.reduce((total, channel) => total + data[index + channel]!, 0) - neutralLevel * keyed.length,
  );
  let active = keyed.filter((channel) => data[index + channel]! > 0);
  while (remaining > 0 && active.length) {
    const share = Math.ceil(remaining / active.length);
    const next: number[] = [];
    for (const channel of active) {
      const reduction = Math.min(data[index + channel]!, share, remaining);
      data[index + channel] = data[index + channel]! - reduction;
      remaining -= reduction;
      if (data[index + channel]! > 0) next.push(channel);
    }
    active = next;
  }
}

function stripSpill(raster: Raster, keyed: number[], neutral: number[]): void {
  const { data } = raster;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const residual = Math.max(0, average(data, index, keyed) - average(data, index, neutral));
    if (residual > 0) removeKeyedSpill(data, index, keyed, average(data, index, neutral));
  }
}

/** Trim to the visible piece, then centre it on a square transparent canvas. */
export function frameTransparentGarment(raster: Raster, canvasSize = 1024, occupancy = 0.88): Raster {
  const { data, width, height } = raster;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    if (data[index + 3]! <= 8) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX || maxY < minY) throw new Error("Background removal did not leave a visible garment");

  const trimWidth = maxX - minX + 1;
  const trimHeight = maxY - minY + 1;
  const source = canvasOf(width, height);
  source.context.putImageData(new ImageData(data, width, height), 0, 0);

  const target = Math.max(1, Math.round(canvasSize * Math.max(0.5, Math.min(0.96, occupancy))));
  const scale = Math.min(target / trimWidth, target / trimHeight);
  const drawWidth = Math.max(1, Math.round(trimWidth * scale));
  const drawHeight = Math.max(1, Math.round(trimHeight * scale));

  const out = canvasOf(canvasSize, canvasSize);
  out.context.imageSmoothingEnabled = true;
  out.context.imageSmoothingQuality = "high";
  out.context.drawImage(
    source.canvas,
    minX,
    minY,
    trimWidth,
    trimHeight,
    Math.floor((canvasSize - drawWidth) / 2),
    Math.floor((canvasSize - drawHeight) / 2),
    drawWidth,
    drawHeight,
  );
  const framed = out.context.getImageData(0, 0, canvasSize, canvasSize);
  return { data: framed.data, width: framed.width, height: framed.height };
}

export type ChromaDiagnostics = { contaminatedPixels: number; maxSpill: number };

function verifyNoChromaSpill(raster: Raster, keyed: number[], neutral: number[]): ChromaDiagnostics {
  const { data } = raster;
  let contaminatedPixels = 0;
  let maxSpill = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const spill = Math.max(0, average(data, index, keyed) - average(data, index, neutral));
    if (spill > maxSpill) maxSpill = spill;
    if (spill > 1.5) contaminatedPixels += 1;
  }
  return { contaminatedPixels, maxSpill };
}

export type ChromaResult = {
  raster: Raster;
  verification: ChromaDiagnostics;
  tolerance: number;
};

/**
 * Lift the flat chroma background the image model was asked to produce, remove
 * the spill it leaves around the edges, then frame the result. Same tolerance
 * range and feather as the original, so members can still nudge the tolerance
 * when an edge comes out soft.
 */
export async function processChromaBackground(
  file: Blob,
  key: string,
  options: { tolerance?: number } = {},
): Promise<ChromaResult> {
  const tolerance = cleanupTolerance(options.tolerance);
  const feather = 80;
  const { target, keyed, neutral } = keyChannels(key);
  const raster = await readRaster(file);
  const { data } = raster;

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.sqrt(
      (data[index]! - target[0]!) ** 2 +
        (data[index + 1]! - target[1]!) ** 2 +
        (data[index + 2]! - target[2]!) ** 2,
    );
    if (distance <= tolerance) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
      continue;
    }
    if (distance < tolerance + feather) {
      data[index + 3] = Math.round(data[index + 3]! * ((distance - tolerance) / feather));
    }
    const neutralLevel = average(data, index, neutral);
    const spill = Math.max(0, average(data, index, keyed) - neutralLevel);
    if (spill > 0) {
      const spillAlpha = Math.max(0, 1 - Math.max(0, spill - 4) / 150);
      data[index + 3] = Math.round(data[index + 3]! * spillAlpha);
      removeKeyedSpill(data, index, keyed, neutralLevel);
    }
    if (data[index + 3]! <= 8) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    }
  }

  stripSpill(raster, keyed, neutral);
  const framed = frameTransparentGarment(raster);
  stripSpill(framed, keyed, neutral);

  return { raster: framed, verification: verifyNoChromaSpill(framed, keyed, neutral), tolerance };
}

/**
 * Strict variant used by the pipeline: refuses a cutout that still carries chroma
 * contamination, exactly as the original did, so a poor result is retried rather
 * than saved.
 */
export async function removeChromaBackground(
  file: Blob,
  key: string,
  options: { tolerance?: number; strict?: boolean } = {},
): Promise<Blob> {
  const result = await processChromaBackground(file, key, options);
  if (options.strict !== false && result.verification.contaminatedPixels > 1) {
    throw new Error(
      `Background cleanup left ${result.verification.contaminatedPixels} chroma-contaminated pixels`,
    );
  }
  return rasterToBlob(result.raster);
}
