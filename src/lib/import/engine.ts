/**
 * The import pipeline, orchestrated in the browser.
 *
 * The server owns the two things that must not be trusted to a browser — the AI
 * calls and the money — while cropping, background removal and framing happen
 * here on the member's own machine. That keeps the original app's image quality
 * intact without needing native image libraries on the server.
 *
 * Job shape is deliberately unchanged from the original API so the existing
 * import UI keeps working: each job carries a `crop` stage and a `garment` stage,
 * each of which waits for the member's approval.
 */
import { apiFetch } from "@/lib/api-fetch";
import {
  chooseChromaKey,
  cropDetectedItem,
  encodeForUpload,
  normalizeImage,
  processChromaBackground,
  rasterToBlob,
} from "@/lib/image/pixels";


export type StageStatus = "processing" | "review" | "approved" | "rejected" | "failed";

export type ImportStage = {
  status: StageStatus;
  assetUrl?: string | null | undefined;
  failedAssetUrl?: string | null | undefined;
  cleanupPreviewUrl?: string | null | undefined;
  cleanupTolerance?: number;
  cleanupDiagnostics?: { contaminatedPixels: number; maxSpill: number };
  error?: string | null | undefined;
};

export type ImportMetadata = {
  name: string;
  part: string;
  color: string;
  secondaryColor: string | null;
  tags: string[];
};

export type ImportJob = {
  id: string;
  sourceKey: string;
  detectionKey: string;
  metadata: ImportMetadata;
  originalAssetUrl: string;
  chromaKey: string;
  stages: { crop: ImportStage; garment: ImportStage; modeled?: ImportStage };
  error?: string | null;
};

/** Image data lives outside React state; only display URLs go into the jobs. */
type JobAssets = { source: Blob; crop: Blob; generated?: Blob | undefined; cutout?: Blob | undefined };
const assets = new Map<string, JobAssets>();

const objectUrls = new Set<string>();

function trackUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  objectUrls.add(url);
  return url;
}

/** Frees the browser memory held for a job that has been saved or discarded. */
export function releaseJob(id: string) {
  assets.delete(id);
}

export function releaseAllJobs() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
  assets.clear();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < buffer.length; index += chunk) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mime = "image/png"): Blob {
  const binary = atob(base64.replace(/^data:[^,]+,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(value.error || "That step could not be completed."), {
      code: value.code,
      requiredPence: value.requiredPence,
      balancePence: value.balancePence,
      status: response.status,
    });
  }
  return value as T;
}

type AnalyzeResponse = {
  items: Array<{
    name: string;
    part: string;
    color: string;
    secondaryColor: string | null;
    tags: string[];
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  noClothingDetected: boolean;
};

let counter = 0;
function nextJobId(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

function sourceKeyFor(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

function detectionKeyFor(box: AnalyzeResponse["items"][number]["boundingBox"]): string {
  return [box.x, box.y, box.width, box.height].map((value) => Math.round(value)).join(":");
}

/**
 * Stage one: the photo is read by the AI, then each detected item is cropped out
 * locally and offered for approval.
 */
export async function startImport(
  file: File,
  extra: { name?: string } = {},
): Promise<{ jobs: ImportJob[]; noClothingDetected: boolean }> {
  const normalized = await normalizeImage(file);
  // The read stage only needs to *see* the photo, so a compact JPEG goes up:
  // a full-resolution PNG from a phone camera is tens of megabytes and gets
  // refused as too large. Crops below still come from the full-quality copy.
  const forReading = await encodeForUpload(normalized, { maxEdge: 1600, quality: 0.9 });
  const base64 = await blobToBase64(forReading);
  const result = await post<AnalyzeResponse>("/api/import/analyze", {
    imageBase64: base64,
    mime: "image/jpeg",
    byteSize: forReading.size,
  });


  if (!result.items.length) return { jobs: [], noClothingDetected: true };

  const fallbackName = extra.name || file.name.replace(/\.[^.]+$/, "");
  const jobs: ImportJob[] = [];
  const sourceKey = sourceKeyFor(file);

  for (const detected of result.items) {
    const id = nextJobId();
    const crop = await cropDetectedItem(normalized, detected.boundingBox);
    assets.set(id, { source: normalized, crop });
    jobs.push({
      id,
      sourceKey,
      detectionKey: detectionKeyFor(detected.boundingBox),
      metadata: {
        name: result.items.length === 1 && fallbackName ? fallbackName : detected.name,
        part: detected.part,
        color: detected.color,
        secondaryColor: detected.secondaryColor,
        tags: detected.tags,
      },
      originalAssetUrl: trackUrl(normalized),
      chromaKey: chooseChromaKey(detected.color),
      stages: {
        crop: { status: "review", assetUrl: trackUrl(crop) },
        garment: { status: "processing" },
      },
    });
  }

  return { jobs, noClothingDetected: false };
}

/**
 * Stage two: the approved crop becomes a clean garment image. The AI paints it on
 * a flat chroma background, which is then lifted here; a contaminated edge lands
 * the job in the local cleanup editor instead of being saved.
 */
export async function generateGarment(
  job: ImportJob,
  options: { direction?: string; metadata?: Partial<ImportMetadata> } = {},
): Promise<ImportJob> {
  const stored = assets.get(job.id);
  if (!stored) throw new Error("That import is no longer available. Please add the photo again.");

  const metadata = { ...job.metadata, ...options.metadata };
  const response = await post<{ imageBase64: string; chromaKey: string }>("/api/import/cutout", {
    imageBase64: await blobToBase64(stored.crop),
    chromaKey: job.chromaKey,
    metadata,
    direction: options.direction || undefined,
    byteSize: stored.crop.size,
  });

  const generated = base64ToBlob(response.imageBase64);
  assets.set(job.id, { ...stored, generated, cutout: undefined });

  const cleaned = await processChromaBackground(generated, response.chromaKey);
  const contaminated = cleaned.verification.contaminatedPixels;

  if (contaminated > 1) {
    return {
      ...job,
      metadata,
      chromaKey: response.chromaKey,
      stages: {
        ...job.stages,
        crop: { status: "approved", assetUrl: job.stages.crop.assetUrl },
        garment: {
          status: "failed",
          failedAssetUrl: trackUrl(generated),
          cleanupTolerance: cleaned.tolerance,
          cleanupDiagnostics: cleaned.verification,
          error: "The background cleanup left tinted pixels at the edge.",
        },
      },
    };
  }

  const cutout = await rasterToBlob(cleaned.raster);
  assets.set(job.id, { ...stored, generated, cutout });

  return {
    ...job,
    metadata,
    chromaKey: response.chromaKey,
    stages: {
      ...job.stages,
      crop: { status: "approved", assetUrl: job.stages.crop.assetUrl },
      garment: { status: "review", assetUrl: trackUrl(cutout), cleanupTolerance: cleaned.tolerance },
    },
  };
}

/**
 * Re-runs the local cleanup at a different strength. No AI call, no charge — the
 * generated image is reused exactly as the original app did.
 */
export async function runCleanup(
  job: ImportJob,
  tolerance: number,
  accept: boolean,
): Promise<ImportJob> {
  const stored = assets.get(job.id);
  const generated = stored?.generated;
  if (!stored || !generated) throw new Error("That generated image is no longer available.");

  const cleaned = await processChromaBackground(generated, job.chromaKey, { tolerance });
  const cutout = await rasterToBlob(cleaned.raster);
  assets.set(job.id, { ...stored, cutout });

  if (accept) {
    return {
      ...job,
      stages: {
        ...job.stages,
        garment: {
          status: "review",
          assetUrl: trackUrl(cutout),
          cleanupTolerance: cleaned.tolerance,
        },
      },
    };
  }

  return {
    ...job,
    stages: {
      ...job.stages,
      garment: {
        ...job.stages.garment,
        status: "failed",
        cleanupPreviewUrl: trackUrl(cutout),
        cleanupTolerance: cleaned.tolerance,
        cleanupDiagnostics: cleaned.verification,
      },
    },
  };
}

export type SavedPiece = {
  id: string;
  name: string;
  part: string;
  color: string | null;
  secondaryColor: string | null;
  palette: string[];
  tags: string[];
  value: number | null;
  image: string | null;
  thumbnail: string | null;
  modeledImage: string | null;
  importJobId: string | null;
};

/** Stage three: the approved piece is stored in the member's private wardrobe. */
export async function savePiece(
  job: ImportJob,
  metadata: ImportMetadata & { value: number | null },
): Promise<SavedPiece> {
  const cutout = assets.get(job.id)?.cutout;
  if (!cutout) throw new Error("That garment image is no longer available.");

  const { item } = await post<{ item: SavedPiece }>("/api/import/pieces", {
    name: metadata.name,
    part: metadata.part,
    color: metadata.color,
    secondaryColor: metadata.secondaryColor || null,
    tags: metadata.tags,
    value: metadata.value,
    cutout: await blobToBase64(cutout),
    importJobId: job.id,
  });

  releaseJob(job.id);
  return item;
}

export type WishlistPiece = {
  id: string;
  name: string;
  brand: string | null;
  price: string | null;
  part: string;
  url: string | null;
  note: string | null;
  status: string;
  image: string | null;
  modeledImage: string | null;
};

/**
 * The same extraction the wardrobe uses, filed on the wishlist instead: the photo
 * is read, each detected item is cropped locally, turned into a clean cut-out and
 * saved as something the member wants rather than owns.
 */
export async function importPhotoToWishlist(file: File): Promise<{
  items: WishlistPiece[];
  noClothingDetected: boolean;
}> {
  const { jobs, noClothingDetected } = await startImport(file);
  if (!jobs.length) return { items: [], noClothingDetected };

  const items: WishlistPiece[] = [];
  for (const job of jobs) {
    const finished = await generateGarment(job);
    const cutout = assets.get(job.id)?.cutout;
    if (!cutout) continue;
    const item = await post<WishlistPiece>("/api/wishlist", {
      name: finished.metadata.name,
      part: finished.metadata.part,
      color: finished.metadata.color,
      tags: finished.metadata.tags,
      imageDataUrl: `data:image/png;base64,${await blobToBase64(cutout)}`,
    });
    items.push(item);
    releaseJob(job.id);
  }

  return { items, noClothingDetected: false };
}
