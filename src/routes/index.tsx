import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";
import { setPendingOutfitPhoto } from "@/lib/trial/handoff";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wardrobe — know what your wardrobe is worth" },
      {
        name: "description",
        content:
          "See the live resale value of every piece you own, in GBP, with share cards for what your wardrobe is worth.",
      },
      { property: "og:title", content: "Wardrobe — know what your wardrobe is worth" },
      {
        property: "og:description",
        content:
          "See the live resale value of every piece you own, in GBP, with share cards for what your wardrobe is worth.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  return (
    <LandingPage
      onEnter={() => navigate({ to: "/try" })}
      onPhotoChosen={(file) => {
        setPendingOutfitPhoto(file);
        navigate({ to: "/try" });
      }}
    />
  );
}
