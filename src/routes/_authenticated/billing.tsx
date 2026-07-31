import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getStripeEnvironment, VAULT_PRICE_ID } from "@/lib/stripe";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { createPortalSession, getVaultAccess } from "@/utils/payments.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Your Vault membership — Wardrobe" },
      {
        name: "description",
        content: "Manage your Wardrobe Vault membership: £4.99 a month for private, saved storage of your wardrobe.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Billing,
});

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Billing() {
  const fetchAccess = useServerFn(getVaultAccess);
  const openPortal = useServerFn(createPortalSession);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["vault-access"],
    queryFn: () => fetchAccess({ data: { environment: getStripeEnvironment() } }),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const result = await openPortal({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => setError(e.message),
  });

  const renewal = formatDate(data?.currentPeriodEnd ?? null);

  return (
    <>
      <PaymentTestModeBanner />
      <main className="auth-page">
        <article className="auth-card" style={{ maxWidth: 620 }}>
          <p className="auth-wordmark">
            WARDROBE<span>®</span>
          </p>
          <p className="auth-kicker">Membership</p>

          {isPending ? (
            <p className="auth-lede">Checking your membership…</p>
          ) : data?.subscribed ? (
            <>
              <h1>Your Vault is open.</h1>
              <p className="auth-lede">
                {data.plan === "founder"
                  ? "Founder access — your wardrobe is stored privately, with no renewal date."
                  : data.cancelAtPeriodEnd
                    ? `Your membership ends on ${renewal}. Your pieces stay saved until then.`
                    : renewal
                      ? `£4.99 a month, renewing on ${renewal}.`
                      : "£4.99 a month."}
              </p>
              <p className="auth-lede">
                {data.pieces === 1 ? "1 piece" : `${data.pieces} pieces`} stored in your vault.
              </p>
              {data.hasBillingAccount ? (
                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                >
                  {portal.isPending ? "Opening…" : "Manage billing"}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <h1>Keep your vault.</h1>
              <p className="auth-lede">
                Your first piece is on us. Vault membership is £4.99 a month and keeps your whole
                wardrobe — pieces, outfits and wishlist — stored privately and backed up, with the
                styling tools switched on.
              </p>
              <p className="auth-lede">
                {data?.freePieceRemaining
                  ? "You still have your free first piece to add."
                  : "You've used your free piece — subscribe to add more."}
              </p>
              {checkoutOpen ? (
                <StripeEmbeddedCheckout
                  priceId={VAULT_PRICE_ID}
                  returnUrl={`${window.location.origin}/billing?checkout=complete`}
                />
              ) : (
                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => setCheckoutOpen(true)}
                >
                  Subscribe — £4.99 / month
                </button>
              )}
            </>
          )}

          {error ? <p className="auth-error">{error}</p> : null}

          <p className="auth-alt">
            <Link to="/wardrobe">Back to your wardrobe</Link> · <Link to="/support">Support</Link> ·{" "}
            <Link to="/terms">Terms</Link>
          </p>
        </article>
      </main>
    </>
  );
}
