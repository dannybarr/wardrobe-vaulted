import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";
import { setPendingOutfitPhoto } from "@/lib/trial/handoff";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wardrobe — your clothes, finally in one place" },
      {
        name: "description",
        content:
          "Photograph an outfit and Wardrobe separates the pieces, builds your private digital wardrobe and keeps every look ready to wear.",
      },
      { property: "og:title", content: "Wardrobe — your clothes, finally in one place" },
      {
        property: "og:description",
        content:
          "Photograph an outfit and Wardrobe separates the pieces, builds your private digital wardrobe and keeps every look ready to wear.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  return <LandingPage onEnter={() => navigate({ to: "/try" })} />;
}
