import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { removeChromaBackground } from "./import-job-api.mjs";

const API_ROOT = "/api/wishlist";
const ASSET_ROOT = "/api/wishlist/assets";
const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CURRENCY_SYMBOLS = { GBP: "£", EUR: "€", USD: "$", JPY: "¥", AUD: "A$", CAD: "C$" };

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

async function body(req, limit = 25 * 1024 * 1024) {
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
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await rename(tmp, file);
  } catch (error) {
    if (!["EBUSY", "EXDEV", "EPERM"].includes(error.code)) {
      await rm(tmp, { force: true });
      throw error;
    }
    await copyFile(tmp, file);
    await rm(tmp, { force: true });
  }
}

function decodeEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return null;
}

function jsonLdProducts(html) {
  const products = [];
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    let parsed;
    try { parsed = JSON.parse(match[1].trim()); } catch { continue; }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      const type = node["@type"];
      if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) products.push(node);
    }
  }
  return products;
}

function formatPrice(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return null;
  const numeric = Number(amount);
  const display = Number.isFinite(numeric) ? (Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)) : String(amount);
  const code = (currency || "").toUpperCase();
  if (CURRENCY_SYMBOLS[code]) return `${CURRENCY_SYMBOLS[code]}${display}`;
  return code ? `${display} ${code}` : display;
}

export function parseProductPage(html, pageUrl) {
  const products = jsonLdProducts(html);
  const product = products[0] || null;

  let name = product?.name ? decodeEntities(String(product.name)) : null;
  name = name || metaContent(html, "og:title") || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  name = (name || "").replace(/\s*[|–—-]\s*[^|–—-]{0,60}$/, "").trim() || name || "New wishlist piece";

  let brand = null;
  const rawBrand = product?.brand;
  if (typeof rawBrand === "string") brand = rawBrand;
  else if (rawBrand && typeof rawBrand === "object" && rawBrand.name) brand = rawBrand.name;
  brand = brand ? decodeEntities(String(brand)) : (metaContent(html, "og:site_name") || new URL(pageUrl).hostname.replace(/^www\d?\./, ""));

  let price = null;
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  if (offer) price = formatPrice(offer.price ?? offer.lowPrice, offer.priceCurrency);
  if (!price) price = formatPrice(metaContent(html, "product:price:amount") || metaContent(html, "og:price:amount"), metaContent(html, "product:price:currency") || metaContent(html, "og:price:currency"));

  let imageUrl = null;
  const rawImage = product?.image;
  if (typeof rawImage === "string") imageUrl = rawImage;
  else if (Array.isArray(rawImage) && rawImage.length) imageUrl = typeof rawImage[0] === "string" ? rawImage[0] : rawImage[0]?.url || null;
  else if (rawImage && typeof rawImage === "object" && rawImage.url) imageUrl = rawImage.url;
  imageUrl = imageUrl || metaContent(html, "og:image") || metaContent(html, "twitter:image");
  if (imageUrl) {
    try { imageUrl = new URL(decodeEntities(imageUrl), pageUrl).toString(); } catch { imageUrl = null; }
  }

  return { name: name.slice(0, 120), brand: brand ? String(brand).slice(0, 80) : null, price, imageUrl };
}

function parseValue(input) {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) return Math.round(input * 100) / 100;
  if (typeof input === "string") {
    const numeric = Number(input.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric * 100) / 100;
  }
  return null;
}

function normalizeItem(record, patch = {}) {
  const next = { ...record };
  if (typeof patch.name === "string") next.name = patch.name.trim().slice(0, 120) || next.name;
  if (typeof patch.brand === "string") next.brand = patch.brand.trim().slice(0, 80) || null;
  if (typeof patch.price === "string") next.price = patch.price.trim().slice(0, 40) || null;
  if (typeof patch.url === "string" && /^https?:\/\//i.test(patch.url.trim())) next.url = patch.url.trim();
  if (PARTS.has(patch.part)) next.part = patch.part;
  if (typeof patch.color === "string" && HEX_COLOR.test(patch.color)) next.color = patch.color.toLowerCase();
  if (Array.isArray(patch.tags)) next.tags = patch.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12);
  return next;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function openAIEdit({ key, baseUrl, model, prompt, images, size, quality }) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", quality || "high");
  form.set("output_format", "png");
  for (const [index, image] of images.entries()) {
    const normalized = await sharp(image.data).rotate().toColorspace("srgb").png().toBuffer();
    form.append("image[]", new Blob([normalized], { type: "image/png" }), image.name || `image-${index + 1}.png`);
  }
  const response = await fetch(`${baseUrl}/images/edits`, {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `OpenAI image request failed (${response.status})`);
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error("OpenAI response did not contain image data");
  return Buffer.from(encoded, "base64");
}

export function wardrobeWishlistApi(options = {}) {
  let root;
  let wishlistFile;
  let assetDir;
  const running = new Set();
  const setting = (name, fallback = "") => options.env?.[name] || process.env[name] || fallback;
  const apiBaseUrl = () => setting("OPENAI_API_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");

  async function loadItems() {
    try { return JSON.parse(await readFile(wishlistFile, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }

  async function saveItems(items) {
    await atomicJson(wishlistFile, items);
  }

  async function saveAsset(id, suffix, bytes) {
    await mkdir(assetDir, { recursive: true });
    const name = `${id}${suffix}.png`;
    const png = await sharp(bytes).rotate().toColorspace("srgb").resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    await writeFile(path.join(assetDir, name), png);
    return `${ASSET_ROOT}/${name}?v=${randomUUID()}`;
  }

  async function saveSourceAsset(id, bytes) {
    return saveAsset(id, "-source", bytes);
  }

  async function extractProductAsset(id, bytes, item) {
    await saveSourceAsset(id, bytes);
    const key = setting("OPENAI_API_KEY").trim();
    if (!key) return saveAsset(id, "", bytes);

    const chromaKey = "#00ff00";
    const prompt = [
      "Create a premium transparent catalogue cutout of the single retail product in Image 1.",
      "Preserve the exact product identity, silhouette, proportions, colour, material, construction, logo placement and source-supported details.",
      "Show the whole product, isolated and centred with balanced margin, no crop, no person, no hands, no props, no packaging, no hanger, no floor, no text overlay, and no cast shadow.",
      "Use an absolutely uniform #00ff00 background only; it will be removed after generation. Do not introduce any feature that is not present in the source image.",
      `This item is ${item.name || "a retail product"}${item.brand ? ` by ${item.brand}` : ""}.`,
    ].join(" ");
    const generated = await openAIEdit({
      key,
      baseUrl: apiBaseUrl(),
      model: setting("OPENAI_GARMENT_MODEL", setting("OPENAI_IMAGE_MODEL", "gpt-image-2")),
      quality: setting("OPENAI_IMAGE_QUALITY", "high"),
      size: "1024x1024",
      images: [{ data: bytes, name: "product-source.png" }],
      prompt,
    });
    const clean = await removeChromaBackground(generated, chromaKey);
    return saveAsset(id, "", clean);
  }

  async function downloadImage(imageUrl, pageUrl) {
    const response = await fetchWithTimeout(imageUrl, {
      headers: { "User-Agent": BROWSER_UA, Accept: "image/*,*/*;q=0.8", Referer: new URL(pageUrl).origin },
    });
    if (!response.ok) throw new Error(`Image download failed (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("Image download returned no data");
    return bytes;
  }

  async function resolveUrl(rawUrl) {
    let pageUrl;
    try {
      pageUrl = new URL(rawUrl.trim());
      if (!/^https?:$/.test(pageUrl.protocol)) throw new Error("bad protocol");
    } catch {
      throw Object.assign(new Error("Enter a full product link, starting with http or https."), { status: 400 });
    }

    const id = `wish-${randomUUID()}`;
    const item = {
      id,
      url: pageUrl.toString(),
      name: "New wishlist piece",
      brand: pageUrl.hostname.replace(/^www\d?\./, ""),
      price: null,
      part: "upperbody",
      color: null,
      tags: [],
      image: null,
      modeledImage: null,
      status: "needs-image",
      note: null,
      addedAt: new Date().toISOString(),
    };

    let html = null;
    try {
      const response = await fetchWithTimeout(pageUrl.toString(), {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-GB,en;q=0.9" },
      });
      if (!response.ok) throw new Error(`The site refused the request (${response.status}).`);
      html = await response.text();
    } catch (error) {
      item.note = `${error.name === "AbortError" ? "The site took too long to respond." : error.message} Add the product image manually below.`;
      return item;
    }

    const parsed = parseProductPage(html, pageUrl.toString());
    item.name = parsed.name;
    if (parsed.brand) item.brand = parsed.brand;
    item.price = parsed.price;

    if (!parsed.imageUrl) {
      item.note = "No product image was found on the page. Add it manually below.";
      return item;
    }

    try {
      const bytes = await downloadImage(parsed.imageUrl, pageUrl.toString());
      item.image = await extractProductAsset(id, bytes, item);
      item.status = "ready";
    } catch (error) {
      item.note = `The product image could not be downloaded (${error.message}). Add it manually below.`;
    }
    return item;
  }

  async function generateTryOn(item) {
    const key = setting("OPENAI_API_KEY").trim();
    if (!key) throw Object.assign(new Error("Add OPENAI_API_KEY to .env to enable try-on."), { status: 409 });
    const modelPath = path.resolve(root, setting("WARDROBE_MODEL_REFERENCE", "data/model-reference.png"));
    let modelData;
    try {
      modelData = await readFile(modelPath);
    } catch (error) {
      if (error.code === "ENOENT") throw Object.assign(new Error(`Add a reference photo at ${setting("WARDROBE_MODEL_REFERENCE", "data/model-reference.png")} to enable try-on.`), { status: 409 });
      throw error;
    }
    const productData = await readFile(path.join(assetDir, `${item.id}.png`));
    const prompt = "Create a professional horizontal 3:2 editorial fashion photograph of the person in Image 1 wearing the exact garment or item shown in Image 2. Image 2 is a retail product photo; reproduce that item faithfully on the person in Image 1. Preserve the person's recognizable identity, face, hair, age and proportions. Preserve every color, material, fit, construction, graphic, logo and distinctive detail of the item. Keep the complete featured item clearly visible and unobstructed, use understated neutral supporting clothes, realistic anatomy, natural light, authentic fabric, a tasteful real-world setting, and leave environmental space around the model. No text, watermark, product mockup, or synthetic appearance.";
    const bytes = await openAIEdit({
      key,
      baseUrl: apiBaseUrl(),
      model: setting("OPENAI_MODELED_MODEL", setting("OPENAI_IMAGE_MODEL", "gpt-image-2")),
      quality: setting("OPENAI_IMAGE_QUALITY", "high"),
      size: "1536x1024",
      images: [{ data: modelData, name: "model.png" }, { data: productData, name: "product.png" }],
      prompt,
    });
    return saveAsset(item.id, "-modeled", bytes);
  }

  function libraryPaths() {
    const dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
    return { importedFile: path.join(dataDir, "library.json"), libraryDir: path.join(dataDir, "imported") };
  }

  async function appendLibraryRecord(importedFile, record) {
    let records;
    try { records = JSON.parse(await readFile(importedFile, "utf8")); }
    catch (error) { if (error.code === "ENOENT") records = []; else throw error; }
    await atomicJson(importedFile, [...records, record]);
  }

  async function directAdd(bytes, metadata = {}) {
    const { importedFile, libraryDir } = libraryPaths();
    await mkdir(libraryDir, { recursive: true });
    const jobId = randomUUID();
    const id = `import-${jobId}`;
    const png = await sharp(bytes).rotate().toColorspace("srgb").resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    await writeFile(path.join(libraryDir, `${id}-garment.png`), png);
    const color = typeof metadata.color === "string" && HEX_COLOR.test(metadata.color) ? metadata.color.toLowerCase() : "#d8d0c2";
    const record = {
      id,
      name: typeof metadata.name === "string" ? metadata.name.trim().slice(0, 120) || "New piece" : "New piece",
      part: PARTS.has(metadata.part) ? metadata.part : "upperbody",
      color,
      secondaryColor: null,
      palette: [color],
      tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12) : [],
      image: `/api/import/library/${id}-garment.png`,
      thumbnail: `/api/import/library/${id}-garment.png`,
      modeledImage: null,
      importJobId: jobId,
      value: parseValue(metadata.value),
    };
    await appendLibraryRecord(importedFile, record);
    return record;
  }

  async function purchaseItem(item) {
    const { importedFile, libraryDir } = libraryPaths();
    await mkdir(libraryDir, { recursive: true });
    const jobId = randomUUID();
    const id = `import-${jobId}`;
    await copyFile(path.join(assetDir, `${item.id}.png`), path.join(libraryDir, `${id}-garment.png`));
    let modeledImage = null;
    if (item.modeledImage) {
      await copyFile(path.join(assetDir, `${item.id}-modeled.png`), path.join(libraryDir, `${id}-modeled.png`));
      modeledImage = `/api/import/library/${id}-modeled.png`;
    }
    const record = {
      id,
      name: item.name,
      part: item.part,
      color: item.color || "#d8d0c2",
      secondaryColor: null,
      palette: [item.color].filter(Boolean),
      tags: item.tags,
      image: `/api/import/library/${id}-garment.png`,
      thumbnail: `/api/import/library/${id}-garment.png`,
      modeledImage,
      importJobId: jobId,
      value: parseValue(item.price),
    };
    await appendLibraryRecord(importedFile, record);
    return record;
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/wishlist") && url.pathname !== "/api/wardrobe/direct-add") return next();
    try {
      if (url.pathname === "/api/wardrobe/direct-add" && req.method === "POST") {
        const input = await body(req);
        const raw = typeof input.imageDataUrl === "string" ? input.imageDataUrl : "";
        const match = raw.match(/^data:image\/[\w+.-]+;base64,(.+)$/s);
        if (!match) return json(res, 400, { error: "imageDataUrl must be a base64 image data URL." });
        const bytes = Buffer.from(match[1], "base64");
        if (!bytes.length) return json(res, 400, { error: "Image payload is empty" });
        return json(res, 201, await directAdd(bytes, input.metadata));
      }

      if (url.pathname === API_ROOT && req.method === "GET") {
        return json(res, 200, await loadItems());
      }

      if (url.pathname === `${API_ROOT}/resolve` && req.method === "POST") {
        const input = await body(req);
        if (typeof input.url !== "string" || !input.url.trim()) return json(res, 400, { error: "A product link is required." });
        const items = await loadItems();
        const existing = items.find((item) => item.url === input.url.trim());
        if (existing) return json(res, 200, { item: existing, duplicate: true });
        const item = await resolveUrl(input.url);
        await saveItems([...items, item]);
        return json(res, 201, { item, duplicate: false });
      }

      const assetMatch = url.pathname.match(/^\/api\/wishlist\/assets\/([\w.-]+)$/i);
      if (assetMatch && req.method === "GET") {
        const file = path.join(assetDir, path.basename(assetMatch[1]));
        await stat(file);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.end(await readFile(file));
      }

      const itemMatch = url.pathname.match(/^\/api\/wishlist\/(wish-[a-f0-9-]{36})(?:\/(image|tryon|purchase))?$/i);
      if (!itemMatch) return json(res, 404, { error: "Not found" });
      const [, id, action] = itemMatch;
      const items = await loadItems();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return json(res, 404, { error: "Wishlist item not found" });
      const item = items[index];

      if (!action && req.method === "PATCH") {
        const patch = await body(req);
        const next = normalizeItem(item, patch);
        items[index] = next;
        await saveItems(items);
        return json(res, 200, next);
      }

      if (!action && req.method === "DELETE") {
        await saveItems(items.filter((entry) => entry.id !== id));
        await Promise.all([
          rm(path.join(assetDir, `${id}.png`), { force: true }),
          rm(path.join(assetDir, `${id}-source.png`), { force: true }),
          rm(path.join(assetDir, `${id}-modeled.png`), { force: true }),
        ]);
        return json(res, 200, { deleted: true, id });
      }

      if (action === "image" && req.method === "POST") {
        const input = await body(req);
        const raw = typeof input.imageDataUrl === "string" ? input.imageDataUrl : "";
        const match = raw.match(/^data:image\/[\w+.-]+;base64,(.+)$/s);
        if (!match) return json(res, 400, { error: "imageDataUrl must be a base64 image data URL." });
        const bytes = Buffer.from(match[1], "base64");
        if (!bytes.length) return json(res, 400, { error: "Image payload is empty" });
        item.image = await extractProductAsset(id, bytes, item);
        item.status = "ready";
        item.note = null;
        items[index] = item;
        await saveItems(items);
        return json(res, 200, item);
      }

      if (action === "tryon" && req.method === "POST") {
        if (item.status !== "ready" || !item.image) return json(res, 409, { error: "Add a product image before generating a try-on." });
        if (running.has(id)) return json(res, 409, { error: "A try-on is already being generated for this item." });
        running.add(id);
        try {
          const modeledImage = await generateTryOn(item);
          const fresh = await loadItems();
          const freshIndex = fresh.findIndex((entry) => entry.id === id);
          if (freshIndex === -1) return json(res, 404, { error: "Wishlist item not found" });
          fresh[freshIndex] = { ...fresh[freshIndex], modeledImage };
          await saveItems(fresh);
          return json(res, 200, fresh[freshIndex]);
        } finally {
          running.delete(id);
        }
      }

      if (action === "purchase" && req.method === "POST") {
        if (item.status !== "ready" || !item.image) return json(res, 409, { error: "Add a product image before moving this to your wardrobe." });
        const record = await purchaseItem(item);
        await saveItems(items.filter((entry) => entry.id !== id));
        await Promise.all([
          rm(path.join(assetDir, `${id}.png`), { force: true }),
          rm(path.join(assetDir, `${id}-source.png`), { force: true }),
          rm(path.join(assetDir, `${id}-modeled.png`), { force: true }),
        ]);
        return json(res, 200, { purchased: true, record });
      }

      return json(res, 404, { error: "Not found" });
    } catch (error) {
      const statusCode = error.code === "ENOENT" ? 404 : error.status || 500;
      return json(res, statusCode, { error: statusCode === 500 ? "Internal server error" : error.message, ...(process.env.NODE_ENV === "development" && statusCode === 500 ? { detail: error.message } : {}) });
    }
  }

  return {
    name: "wardrobe-wishlist-api",
    apply: "serve",
    async configResolved(config) {
      root = config.root;
      const dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
      wishlistFile = path.join(dataDir, "wishlist.json");
      assetDir = path.join(dataDir, "wishlist");
      await mkdir(assetDir, { recursive: true });
    },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
