import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { openAIEdit } from "./import-job-api.mjs";

const API_ROOT = "/api/outfits";
const IMAGE_ROOT = "/api/outfits/assets";
const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);
const PART_LABELS = { upperbody: "top", wholebody_up: "layer", lowerbody: "bottom", accessories_up: "accessory", shoes: "shoes" };

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

async function body(req, limit = 128 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Expected a JSON request body"), { status: 400 }); }
}

async function atomicJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  try { await rename(temp, file); }
  catch (error) {
    if (!['EBUSY', 'EXDEV', 'EPERM'].includes(error.code)) {
      await rm(temp, { force: true });
      throw error;
    }
    await copyFile(temp, file);
    await rm(temp, { force: true });
  }
}

function cleanName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

function itemColors(item) {
  return [item.color, item.secondaryColor, ...(Array.isArray(item.palette) ? item.palette : [])]
    .filter((color, index, all) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) && all.indexOf(color) === index);
}

function defaultName(items) {
  const first = items[0]?.name || "New";
  const second = items[1]?.name || "look";
  return `${first} + ${second}`.slice(0, 80);
}

function publicOutfit(outfit) {
  return { ...outfit, generation: outfit.generation?.status === "processing" ? { status: "processing" } : outfit.generation || null };
}

export function wardrobeOutfitsApi(options = {}) {
  let root;
  let outfitsFile;
  let outfitImageDir;
  let libraryFile;
  let libraryDir;
  const running = new Map();
  const setting = (name, fallback = "") => options.env?.[name] || process.env[name] || fallback;
  const apiBaseUrl = () => setting("OPENAI_API_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");

  async function loadOutfits() {
    try {
      const records = JSON.parse(await readFile(outfitsFile, "utf8"));
      return Array.isArray(records) ? records : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function saveOutfits(outfits) { await atomicJson(outfitsFile, outfits); }

  async function loadLibrary() {
    try {
      const records = JSON.parse(await readFile(libraryFile, "utf8"));
      return Array.isArray(records) ? records : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function persist(outfit) {
    const outfits = await loadOutfits();
    await saveOutfits([...outfits.filter((entry) => entry.id !== outfit.id), outfit]);
  }

  async function generate(outfit) {
    if (running.has(outfit.id)) return running.get(outfit.id);
    const task = (async () => {
      try {
        const key = setting("OPENAI_API_KEY").trim();
        const referencePath = path.resolve(root, setting("WARDROBE_MODEL_REFERENCE", "data/model-reference.png"));
        if (!key) throw new Error("OPENAI_API_KEY is not configured.");
        await stat(referencePath);
        const library = await loadLibrary();
        const pieces = outfit.garmentIds.map((id) => library.find((item) => item.id === id)).filter(Boolean);
        if (pieces.length !== outfit.garmentIds.length) throw new Error("One or more pieces in this outfit are no longer in your wardrobe.");
        const images = [{ data: await readFile(referencePath), mime: "image/png", name: "model-reference.png" }];
        for (const piece of pieces) {
          const filename = path.basename(new URL(piece.image, "http://localhost").pathname);
          images.push({ data: await readFile(path.join(libraryDir, filename)), mime: "image/png", name: `${piece.id}.png` });
        }
        const garmentList = pieces.map((piece, index) => `Image ${index + 2}: ${piece.name} (${piece.part}; ${itemColors(piece).join(", ") || "exact source colours"})`).join("\n");
        const bytes = await openAIEdit({
          key,
          baseUrl: apiBaseUrl(),
          model: setting("OPENAI_OUTFIT_MODEL", setting("OPENAI_IMAGE_MODEL", "gpt-image-2")),
          quality: setting("OPENAI_IMAGE_QUALITY", "high"),
          size: "1536x1024",
          images,
          prompt: `Create a polished full-body editorial fashion photograph of the exact person in Image 1 wearing the complete outfit specified by Images 2 onward. Preserve the person's recognizable identity, face, hair, age, build, and proportions. Every selected garment must remain unmistakably faithful to its source: exact colour, fabric, silhouette, pattern, graphics, logos, construction, and proportions. Use every selected piece exactly once; do not add any visible clothing except plain neutral basics only when needed for modesty. Compose head to shoes with the complete look clearly readable in one naturally lit, restrained real-world setting.\n\nSelected pieces:\n${garmentList}\n\nAvoid: any extra people, text, watermark, product mockup, synthetic beauty treatment, cropped feet, invented logos, altered garment details, or impossible layering.`,
        });
        const filename = `${outfit.id}-modeled.png`;
        await writeFile(path.join(outfitImageDir, filename), bytes);
        await persist({ ...outfit, modeledImage: `${IMAGE_ROOT}/${filename}?v=${Date.now()}`, generation: { status: "complete", completedAt: new Date().toISOString() } });
      } catch (error) {
        await persist({ ...outfit, generation: { status: "failed", error: error.message || "The on-model image could not be generated." } });
      }
    })().finally(() => running.delete(outfit.id));
    running.set(outfit.id, task);
    return task;
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(API_ROOT)) return next();
    try {
      if (url.pathname === API_ROOT && req.method === "GET") return json(res, 200, (await loadOutfits()).map(publicOutfit));
      if (url.pathname === API_ROOT && req.method === "POST") {
        const input = await body(req);
        const ids = [...new Set(Array.isArray(input.garmentIds) ? input.garmentIds.filter((id) => typeof id === "string") : [])].slice(0, 5);
        if (ids.length < 2) throw Object.assign(new Error("Choose at least two pieces to build an outfit."), { status: 400 });
        const library = await loadLibrary();
        const pieces = ids.map((id) => library.find((item) => item.id === id)).filter(Boolean);
        if (pieces.length !== ids.length || pieces.some((item) => !PARTS.has(item.part))) throw Object.assign(new Error("Every selected piece must be available in your wardrobe."), { status: 400 });
        const duplicate = pieces.find((piece, index) => pieces.some((other, otherIndex) => otherIndex < index && other.part === piece.part));
        if (duplicate) throw Object.assign(new Error(`Choose only one ${PART_LABELS[duplicate.part] || "piece"} per outfit.`), { status: 400 });
        const outfit = { id: `outfit-${randomUUID()}`, name: cleanName(input.name) || defaultName(pieces), garmentIds: ids, colors: [...new Set(pieces.flatMap(itemColors))].slice(0, 6), createdAt: new Date().toISOString(), modeledImage: null, generation: null };
        await persist(outfit);
        return json(res, 201, publicOutfit(outfit));
      }
      const assetMatch = url.pathname.match(/^\/api\/outfits\/assets\/(outfit-[\w-]+-modeled\.png)$/i);
      if (assetMatch && req.method === "GET") {
        const file = path.join(outfitImageDir, path.basename(assetMatch[1]));
        await stat(file);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.end(await readFile(file));
      }
      const match = url.pathname.match(/^\/api\/outfits\/(outfit-[a-f0-9-]{36})(?:\/(modeled))?$/i);
      if (!match) return json(res, 404, { error: "Not found" });
      const [, id, action] = match;
      const outfit = (await loadOutfits()).find((entry) => entry.id === id);
      if (!outfit) return json(res, 404, { error: "Outfit not found" });
      if (req.method === "DELETE" && !action) {
        await saveOutfits((await loadOutfits()).filter((entry) => entry.id !== id));
        if (outfit.modeledImage) await rm(path.join(outfitImageDir, `${id}-modeled.png`), { force: true });
        return json(res, 200, { deleted: true, id });
      }
      if (req.method === "POST" && action === "modeled") {
        if (outfit.generation?.status === "processing") return json(res, 202, publicOutfit(outfit));
        const pending = { ...outfit, generation: { status: "processing", startedAt: new Date().toISOString() } };
        await persist(pending);
        void generate(pending);
        return json(res, 202, publicOutfit(pending));
      }
      return json(res, 404, { error: "Not found" });
    } catch (error) {
      return json(res, error.status || (error.code === "ENOENT" ? 404 : 500), { error: error.message || "Internal server error" });
    }
  }

  return {
    name: "wardrobe-outfits-api",
    apply: "serve",
    async configResolved(config) {
      root = config.root;
      const dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
      outfitsFile = path.join(dataDir, "outfits.json");
      outfitImageDir = path.join(dataDir, "outfit-images");
      libraryFile = path.join(dataDir, "library.json");
      libraryDir = path.join(dataDir, "imported");
      await mkdir(outfitImageDir, { recursive: true });
    },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
