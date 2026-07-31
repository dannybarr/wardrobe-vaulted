import { createFileRoute } from "@tanstack/react-router";
import { WardrobeApp } from "@/components/wardrobe/App.jsx";

export const Route = createFileRoute("/_authenticated/wardrobe")({
  head: () => ({
    meta: [
      { title: "Your wardrobe — Wardrobe" },
      { name: "description", content: "Every piece you own, catalogued and ready to wear." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <WardrobeApp />,
});
