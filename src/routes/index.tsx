import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";
import { setPendingOutfitPhoto } from "@/lib/trial/handoff";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wardrobe — the quiet wealth inside your wardrobe" },
      {
        name: "description",
        content:
          "Snap a photo to instantly digitise any piece. Watch your wardrobe’s live market value grow, plan your rotation, and share your personal vault.",
      },
      { property: "og:title", content: "Wardrobe — the quiet wealth inside your wardrobe" },
      {
        property: "og:description",
        content:
          "Snap a photo to instantly digitise any piece. Watch your wardrobe’s live market value grow, plan your rotation, and share your personal vault.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  return (
    <LandingPage
      onPhotoChosen={(file) => {
        setPendingOutfitPhoto(file);
        navigate({ to: "/try" });
      }}
    />
  );
}
