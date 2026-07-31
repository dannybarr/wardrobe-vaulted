import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use — Wardrobe" },
      {
        name: "description",
        content: "The terms that apply when you use Wardrobe during the private alpha.",
      },
      { property: "og:title", content: "Terms of use — Wardrobe" },
      { property: "og:description", content: "The terms that apply when you use Wardrobe." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <main className="auth-page">
      <article className="auth-card" style={{ maxWidth: 640 }}>
        <p className="auth-wordmark">
          WARDROBE<span>®</span>
        </p>
        <p className="auth-kicker">Terms of use</p>
        <h1>The short version.</h1>
        <p className="auth-lede">Last updated 31 July 2026.</p>

        <h2 className="auth-kicker">The alpha</h2>
        <p className="auth-lede">
          Wardrobe is an invitation-only alpha. Features may change, and we may contact you about
          your account or the product. Please don't share your invitation code.
        </p>

        <h2 className="auth-kicker">Your content</h2>
        <p className="auth-lede">
          You keep every right in the photos and details you upload. You give us permission only to
          store them and to process them so the product works for you — nothing more. Upload only
          images you are allowed to use.
        </p>

        <h2 className="auth-kicker">Acceptable use</h2>
        <p className="auth-lede">
          Don't upload unlawful material or images of other people without their consent, and don't
          attempt to access anyone else's wardrobe or disrupt the service.
        </p>

        <h2 className="auth-kicker">Payment</h2>
        <p className="auth-lede">
          Paid plans renew until cancelled, and you can cancel at any time from billing settings.
          AI-heavy actions may be subject to fair-use limits, which we will always show in the app.
        </p>

        <h2 className="auth-kicker">Ending your account</h2>
        <p className="auth-lede">
          You can delete your account whenever you like. We may suspend accounts that break these
          terms. See the <Link to="/privacy">privacy notice</Link> for what happens to your data.
        </p>

        <p className="auth-alt">
          <Link to="/">Back to Wardrobe</Link>
        </p>
      </article>
    </main>
  );
}
