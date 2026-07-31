import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { WardrobeApp } from "@/components/wardrobe/App.jsx";
import { ensureAccountReady } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/wardrobe")({
  head: () => ({
    meta: [
      { title: "Your wardrobe — Wardrobe" },
      { name: "description", content: "Every piece you own, catalogued and ready to wear." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WardrobeRoute,
});

function WardrobeRoute() {
  const prepareAccount = useServerFn(ensureAccountReady);

  // First visit after signing up: make sure the account has its wardrobe,
  // allowances and plan before the gallery asks for them.
  const { isPending, error } = useQuery({
    queryKey: ["account-ready"],
    queryFn: () => prepareAccount(),
    staleTime: Infinity,
    retry: 1,
  });

  if (isPending) {
    return (
      <main className="auth-page">
        <p className="auth-kicker">Opening your wardrobe…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="auth-page">
        <article className="auth-card">
          <h1>We couldn't open your wardrobe</h1>
          <p className="auth-lede">Please refresh the page. If it keeps happening, email us.</p>
        </article>
      </main>
    );
  }

  return <WardrobeApp />;
}

