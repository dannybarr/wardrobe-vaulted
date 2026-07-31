import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { WardrobeApp } from "@/components/wardrobe/App.jsx";
import { ensureAccountReady } from "@/lib/account.functions";
import { getVaultAccess } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

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
  const fetchAccess = useServerFn(getVaultAccess);

  // First visit after signing up: make sure the account has its wardrobe,
  // allowances and plan before the gallery asks for them, then move anything
  // built during the guest trial into it.
  const { isPending, error, isSuccess } = useQuery({
    queryKey: ["account-ready"],
    queryFn: async () => {
      const account = await prepareAccount();
      const { migrateTrialPieces } = await import("@/lib/trial/migrate");
      await migrateTrialPieces().catch(() => 0);
      return account;
    },
    staleTime: Infinity,
    retry: 1,
  });


  const { data: access } = useQuery({
    queryKey: ["vault-access"],
    queryFn: () => fetchAccess({ data: { environment: getStripeEnvironment() } }),
    enabled: isSuccess,
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

  return (
    <>
      <PaymentTestModeBanner />
      {access && !access.canAddPieces ? (
        <div className="vault-notice">
          Your free piece is used. <Link to="/billing">Subscribe for £4.99 a month</Link> to keep
          adding pieces and storing your wardrobe.
        </div>
      ) : null}
      <WardrobeApp />
    </>
  );
}
