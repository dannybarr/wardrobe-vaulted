/**
 * Decides what a founder import may write.
 * Inserts are only for rows the account does not already have.
 * Nothing in the plan deletes or rewrites an existing row.
 * An image is attached only when the existing row carries this catalogue's
 * legacy id and has no image yet.
 */

export type OwnedRow = {
  id: string;
  legacyId: string | null;
  name: string;
  hasImage: boolean;
};

export type ImportAction =
  | { kind: "insert"; founderId: string }
  | { kind: "keep"; founderId: string; existingId: string; attachImage: boolean };

export function planImports(
  existing: readonly OwnedRow[],
  incoming: readonly { id: string; name: string }[],
): ImportAction[] {
  const claimed = new Set<string>();
  return incoming.map((item) => {
    const byLegacy = existing.find((row) => row.legacyId === item.id && !claimed.has(row.id));
    if (byLegacy) {
      claimed.add(byLegacy.id);
      return {
        kind: "keep",
        founderId: item.id,
        existingId: byLegacy.id,
        attachImage: byLegacy.legacyId === item.id && !byLegacy.hasImage,
      };
    }
    const key = item.name.trim().toLowerCase();
    const byName = key
      ? existing.find((row) => !claimed.has(row.id) && row.name.trim().toLowerCase() === key)
      : undefined;
    if (byName) {
      claimed.add(byName.id);
      return {
        kind: "keep",
        founderId: item.id,
        existingId: byName.id,
        attachImage: false,
      };
    }
    return { kind: "insert", founderId: item.id };
  });
}
