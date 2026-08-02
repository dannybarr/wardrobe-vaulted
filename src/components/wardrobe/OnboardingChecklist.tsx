import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import { isGuestMode } from "@/lib/trial/mode";

/** How long the finished checklist stays on screen before it bows out. */
const FAREWELL_MS = 1900;

/** Counts refresh while the checklist is live so a tick lands without a reload. */
const POLL_MS = 5000;

type Props = {
  /** Pieces already in the wardrobe, owned by the gallery. */
  pieceCount: number;
  /** The gallery has finished its first load — avoids an empty flash of "0 of 3". */
  ready: boolean;
  onUploadWardrobe: () => void;
  onCraftOutfit: () => void;
  onAddWishlist: () => void;
};

/**
 * Collections the checklist reads to decide whether a step is done. A missing or
 * failing endpoint counts as zero: the step simply stays open rather than
 * breaking the panel.
 */
async function countFrom(path: string) {
  try {
    const response = await apiFetch(path, { cache: "no-store" });
    if (!response.ok) return 0;
    const value = await response.json();
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

/**
 * First-run checklist, pinned to the top right until the member has touched all
 * three corners of the vault: a piece, an outfit, a wishlist entry.
 *
 * Completion is derived from what is actually in the account rather than from a
 * local flag, so it cannot drift from reality. Once every step is done the
 * moment is stamped on the profile (`onboarding_completed_at`) and the panel
 * never returns — including for members who were already established when this
 * shipped, who are stamped silently without ever seeing it.
 */
export function OnboardingChecklist({
  pieceCount,
  ready,
  onUploadWardrobe,
  onCraftOutfit,
  onAddWishlist,
}: Props) {
  const guest = isGuestMode();
  const queryClient = useQueryClient();
  const panel = useRef<HTMLElement | null>(null);
  const seenIncomplete = useRef(false);
  const stamped = useRef(false);
  const [farewell, setFarewell] = useState(false);

  const { data: profile, isSuccess: profileLoaded } = useQuery({
    queryKey: ["onboarding-profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return { userId: null as string | null, completedAt: null as string | null };
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", auth.user.id)
        .maybeSingle();
      return { userId: auth.user.id, completedAt: data?.onboarding_completed_at ?? null };
    },
    staleTime: Infinity,
    enabled: !guest,
  });

  // Nothing to do for guests, for members who have already finished, or before
  // we know which of those two applies.
  const dormant = guest || !profileLoaded || Boolean(profile?.completedAt) || !profile?.userId;

  const { data: counts, isSuccess: countsLoaded } = useQuery({
    queryKey: ["onboarding-counts"],
    queryFn: async () => ({
      outfits: await countFrom("/api/outfits"),
      wishlist: await countFrom("/api/wishlist"),
    }),
    enabled: !dormant,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!profile?.userId) return;
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", profile.userId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["onboarding-profile"] }),
  });

  const steps = [
    {
      id: "wardrobe",
      label: "Upload your wardrobe",
      hint: "Add your first piece",
      done: pieceCount > 0,
      go: onUploadWardrobe,
    },
    {
      id: "outfit",
      label: "Craft an outfit",
      hint: "Put a look together",
      done: (counts?.outfits ?? 0) > 0,
      go: onCraftOutfit,
    },
    {
      id: "wishlist",
      label: "Add what's next",
      hint: "Save something you want",
      done: (counts?.wishlist ?? 0) > 0,
      go: onAddWishlist,
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;
  const live = !dormant && ready && countsLoaded;

  // Established members are stamped without ever seeing the panel; members who
  // finish in front of us get a short beat before it goes.
  useEffect(() => {
    if (!live || !allDone || stamped.current) return;
    if (!seenIncomplete.current) {
      stamped.current = true;
      finish.mutate();
      return;
    }
    setFarewell(true);
    const timer = window.setTimeout(() => {
      stamped.current = true;
      finish.mutate();
    }, FAREWELL_MS);
    return () => window.clearTimeout(timer);
    // `finish` is a stable mutation handle; re-running on its identity would
    // restart the farewell timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, allDone]);

  useEffect(() => {
    if (live && !allDone) seenIncomplete.current = true;
  }, [live, allDone]);

  // Sits clear of the gallery's own action row while the header is in view, and
  // rises toward the corner once it has scrolled away.
  const place = useCallback(() => {
    const node = panel.current;
    if (!node) return;
    const header = document.querySelector(".gallery-meta-row");
    const below = header ? header.getBoundingClientRect().bottom + 20 : 0;
    node.style.setProperty("--onboarding-top", `${Math.max(20, Math.min(below, 190))}px`);
  }, []);

  useEffect(() => {
    if (!live) return undefined;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(place);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [live, place]);

  if (!live) return null;
  // All three were already done on arrival: stamp quietly, show nothing.
  if (allDone && !seenIncomplete.current) return null;

  return (
    <aside
      ref={panel}
      className={`onboarding${farewell ? " is-complete" : ""}`}
      aria-label="Getting started"
    >
      <div className="onboarding__head">
        <p className="onboarding__kicker">{farewell ? "Your vault is yours" : "Getting started"}</p>
        <span className="onboarding__count" aria-hidden="true">
          {doneCount}/{steps.length}
        </span>
      </div>

      <ol className="onboarding__steps">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              className={`onboarding__step${step.done ? " is-done" : ""}`}
              onClick={step.go}
            >
              <span className="onboarding__mark" aria-hidden="true">
                {step.done && <Check size={11} weight="bold" />}
              </span>
              <span className="onboarding__text">
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </span>
              <span className="onboarding__state">{step.done ? "Done" : "Complete this step"}</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="onboarding__progress" aria-hidden="true">
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </p>
    </aside>
  );
}
