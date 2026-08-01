import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WardrobeApp } from "@/components/wardrobe/App.jsx";
import { FirstOutfitPrompt } from "@/components/wardrobe/FirstOutfitPrompt";
import { countTrialPieces } from "@/lib/trial/store";
import { TRIAL_PIECE_ALLOWANCE } from "@/lib/trial/transport";


export const Route = createFileRoute("/try")({
  // The trial wardrobe lives entirely in this browser, so it is rendered here.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Try Wardrobe — add your first piece, no account needed" },
      {
        name: "description",
        content:
          "Photograph one item and watch Wardrobe cut it out and file it. No account, no card — create your account afterwards to keep it.",
      },
      { property: "og:title", content: "Try Wardrobe — add your first piece" },
      {
        property: "og:description",
        content: "Add your first piece to a real wardrobe in under a minute, before you sign up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TryWardrobe,
});

function TryWardrobe() {
  const [pieces, setPieces] = useState(0);

  // The banner reflects the trial as it progresses, so the prompt to create an
  // account only arrives once the visitor has something worth keeping.
  useEffect(() => {
    let active = true;
    const read = () => {
      countTrialPieces().then((count) => {
        if (active) setPieces(count);
      });
    };
    read();
    const timer = window.setInterval(read, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <div className="vault-notice vault-notice--trial">
        {pieces >= TRIAL_PIECE_ALLOWANCE ? (
          <>
            <strong>Your three free pieces are ready.</strong>{" "}
            <Link to="/auth" search={{ mode: "signup", redirect: "/wardrobe" }}>
              Create your free account
            </Link>{" "}
            and they move straight into your wardrobe.
          </>
        ) : pieces > 0 ? (
          <>
            <strong>Nicely done.</strong> {TRIAL_PIECE_ALLOWANCE - pieces} more free{" "}
            {TRIAL_PIECE_ALLOWANCE - pieces === 1 ? "piece" : "pieces"} to add before you sign up —
            still no account, no card.
          </>
        ) : (
          <>
            <strong>You're trying Wardrobe.</strong> Add your first three pieces free — no account,
            no card. You'll be asked to sign up only when they're ready to keep.
          </>
        )}
      </div>
      <WardrobeApp />
      {pieces === 0 && <FirstOutfitPrompt />}

    </>
  );
}
