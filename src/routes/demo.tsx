import { createFileRoute } from "@tanstack/react-router";
import { WardrobeApp } from "@/components/wardrobe/App";
import { founderPreview } from "@/lib/demo/founder";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wardrobe demo — net worth preview" },
      {
        name: "description",
        content:
          "A read-only look at a full wardrobe, with resale ranges, share cards and listings.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  return (
    <>
      <p className="demo-banner" data-testid="demo-banner">
        A read-only look at a full wardrobe. Sign up to start your own. Nothing on this page is
        saved.
      </p>
      <WardrobeApp preview={founderPreview} />
    </>
  );
}
