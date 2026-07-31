/**
 * The guest wardrobe, held in this browser only.
 *
 * A visitor can add their first piece before there is an account to attach it
 * to, so the finished garment image lives in IndexedDB (localStorage is far too
 * small for a 1024px PNG) until they sign up, at which point it is uploaded into
 * their real wardrobe and cleared from here.
 */
export type TrialPiece = {
  id: string;
  name: string;
  part: string;
  brand: string;
  occasion: string;
  value: number | null;
  color: string | null;
  secondaryColor: string | null;
  palette: string[];
  tags: string[];
  /** The transparent garment PNG, base64 encoded without a data-url prefix. */
  cutout: string;
  createdAt: number;
};

/** What the wardrobe UI expects for one piece. */
export type TrialWardrobeItem = {
  id: string;
  name: string;
  part: string;
  brand: string;
  occasion: string;
  value: number | null;
  color: string | null;
  secondaryColor: string | null;
  palette: string[];
  tags: string[];
  image: string;
  thumbnail: string;
  modeledImage: null;
  importJobId: null;
};

const DB_NAME = "wardrobe-trial";
const STORE = "pieces";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage is unavailable."));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error("That piece could not be saved here."));
    });
  } finally {
    db.close();
  }
}

export async function listTrialPieces(): Promise<TrialPiece[]> {
  try {
    const all = await run<TrialPiece[]>("readonly", (store) => store.getAll());
    return (all ?? []).sort((first, second) => first.createdAt - second.createdAt);
  } catch {
    return [];
  }
}

export async function countTrialPieces(): Promise<number> {
  return (await listTrialPieces()).length;
}

export async function putTrialPiece(piece: TrialPiece): Promise<TrialPiece> {
  await run("readwrite", (store) => store.put(piece));
  return piece;
}

export async function updateTrialPiece(
  id: string,
  patch: Partial<TrialPiece>,
): Promise<TrialPiece | null> {
  const existing = (await listTrialPieces()).find((piece) => piece.id === id);
  if (!existing) return null;
  const next = { ...existing, ...patch, id: existing.id };
  await putTrialPiece(next);
  return next;
}

export async function deleteTrialPiece(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}

export async function clearTrialPieces(): Promise<void> {
  try {
    await run("readwrite", (store) => store.clear());
  } catch {
    /* nothing to clear */
  }
}

export function toTrialWardrobeItem(piece: TrialPiece): TrialWardrobeItem {
  const image = `data:image/png;base64,${piece.cutout}`;
  return {
    id: piece.id,
    name: piece.name,
    part: piece.part,
    brand: piece.brand,
    occasion: piece.occasion,
    value: piece.value,
    color: piece.color,
    secondaryColor: piece.secondaryColor,
    palette: piece.palette,
    tags: piece.tags,
    image,
    thumbnail: image,
    modeledImage: null,
    importJobId: null,
  };
}
