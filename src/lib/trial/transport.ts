/**
 * How the wardrobe screen talks to the outside world while the visitor is still a
 * guest.
 *
 * Nothing in the wardrobe UI knows about the trial: it keeps calling the same
 * paths it always did. This module answers those calls from the browser-held
 * trial wardrobe, and forwards only the two steps that genuinely need a server —
 * the AI photo read and the AI garment image — to capped public endpoints.
 */
import { trialDeviceId } from "@/lib/trial/mode";
import {
  countTrialPieces,
  deleteTrialPiece,
  listTrialPieces,
  putTrialPiece,
  toTrialWardrobeItem,
  updateTrialPiece,
  type TrialPiece,
} from "@/lib/trial/store";

/** How many pieces a guest may build before an account is required. */
export const TRIAL_PIECE_ALLOWANCE = 1;

const SIGNUP_PROMPT =
  "Your first piece is ready. Create your free account to keep it and carry on adding.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function signupRequired() {
  return json({ error: SIGNUP_PROMPT, code: "signup_required" }, 402);
}

async function forward(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("x-wardrobe-device", trialDeviceId());
  return fetch(path, { ...init, headers, cache: "no-store" });
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function readBody(init: RequestInit): Promise<Record<string, unknown>> {
  if (typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Answers a wardrobe API call for a guest. Returns `null` when the call is not
 * part of the trial, so the caller can fall through to the real request.
 */
export async function handleTrialRequest(
  path: string,
  init: RequestInit,
): Promise<Response | null> {
  const method = (init.method ?? "GET").toUpperCase();
  const url = path.split("?")[0] ?? path;

  if (url === "/api/import/config") return json({ ready: true });

  if (url === "/api/import/wardrobe" && method === "GET") {
    const pieces = await listTrialPieces();
    return json(pieces.map(toTrialWardrobeItem));
  }

  if (url === "/api/import/gate") {
    const pieces = await countTrialPieces();
    return json({
      subscribed: false,
      pieces,
      canAddPieces: pieces < TRIAL_PIECE_ALLOWANCE,
      freePieceRemaining: pieces < TRIAL_PIECE_ALLOWANCE,
    });
  }

  if (url === "/api/import/analyze" && method === "POST") {
    if ((await countTrialPieces()) >= TRIAL_PIECE_ALLOWANCE) return signupRequired();
    return forward("/api/public/trial/analyze", init);
  }

  if (url === "/api/import/cutout" && method === "POST") {
    if ((await countTrialPieces()) >= TRIAL_PIECE_ALLOWANCE) return signupRequired();
    return forward("/api/public/trial/cutout", init);
  }

  if (url === "/api/import/pieces" && method === "POST") {
    if ((await countTrialPieces()) >= TRIAL_PIECE_ALLOWANCE) return signupRequired();
    const body = await readBody(init);
    const cutout = asString(body["cutout"]);
    if (!cutout) return json({ error: "That garment image is no longer available." }, 400);

    const piece: TrialPiece = {
      id: `trial-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name: asString(body["name"], "New piece") || "New piece",
      part: asString(body["part"], "upperbody"),
      brand: "",
      occasion: "",
      value: typeof body["value"] === "number" ? (body["value"] as number) : null,
      color: typeof body["color"] === "string" ? (body["color"] as string) : null,
      secondaryColor:
        typeof body["secondaryColor"] === "string" ? (body["secondaryColor"] as string) : null,
      palette: [body["color"], body["secondaryColor"]].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
      tags: Array.isArray(body["tags"]) ? (body["tags"] as string[]).map(String).slice(0, 24) : [],
      cutout: cutout.replace(/^data:[^,]+,/, ""),
      createdAt: Date.now(),
    };

    await putTrialPiece(piece);
    return json({ item: toTrialWardrobeItem(piece) }, 201);
  }

  const pieceMatch = /^\/api\/import\/wardrobe\/([^/]+)$/.exec(url);
  if (pieceMatch?.[1]) {
    const id = decodeURIComponent(pieceMatch[1]);
    if (method === "DELETE") {
      await deleteTrialPiece(id);
      return json({ ok: true });
    }
    if (method === "PATCH") {
      const body = await readBody(init);
      const updated = await updateTrialPiece(id, {
        name: asString(body["name"], "New piece") || "New piece",
        brand: asString(body["brand"]),
        occasion: asString(body["occasion"]),
        part: asString(body["part"], "upperbody"),
        color: typeof body["color"] === "string" ? (body["color"] as string) : null,
        secondaryColor:
          typeof body["secondaryColor"] === "string" ? (body["secondaryColor"] as string) : null,
        tags: Array.isArray(body["tags"]) ? (body["tags"] as string[]).map(String).slice(0, 24) : [],
        value: typeof body["value"] === "number" ? (body["value"] as number) : null,
      });
      if (!updated) return json({ error: "That piece is no longer here." }, 404);
      return json({ item: toTrialWardrobeItem(updated) });
    }
  }

  // Outfits, on-model shots, the wishlist: everything else needs an account.
  return json(
    {
      error: "Create your free account to unlock outfits, on-model shots and your wishlist.",
      code: "signup_required",
    },
    402,
  );
}
