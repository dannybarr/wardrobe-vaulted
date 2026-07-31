import { supabase } from "@/integrations/supabase/client";
import { clearTrialPieces, listTrialPieces } from "@/lib/trial/store";

/**
 * Moves anything built during the guest trial into the freshly created account,
 * then clears the browser copy. Runs once, quietly, the first time the real
 * wardrobe opens — the visitor simply finds their piece already there.
 */
export async function migrateTrialPieces(): Promise<number> {
  const pieces = await listTrialPieces();
  if (!pieces.length) return 0;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 0;

  let moved = 0;
  for (const piece of pieces) {
    const response = await fetch("/api/import/pieces", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: piece.name,
        part: piece.part,
        color: piece.color,
        secondaryColor: piece.secondaryColor,
        tags: piece.tags,
        value: piece.value,
        cutout: piece.cutout,
      }),
    });
    if (response.ok) moved += 1;
    else if (response.status === 402) break; // Out of allowance; keep the local copy.
  }

  if (moved === pieces.length) await clearTrialPieces();
  return moved;
}
