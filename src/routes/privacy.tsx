import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — Wardrobe" },
      {
        name: "description",
        content:
          "How Wardrobe handles your garment photos, what we store, who can see it, and how to export or delete everything.",
      },
      { property: "og:title", content: "Privacy notice — Wardrobe" },
      { property: "og:description", content: "How Wardrobe handles your wardrobe data." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="auth-page">
      <article className="auth-card" style={{ maxWidth: 640 }}>
        <p className="auth-wordmark">
          WARDROBE<span>®</span>
        </p>
        <p className="auth-kicker">Privacy notice</p>
        <h1>Your wardrobe is yours.</h1>

        <p className="auth-lede">Last updated 31 July 2026.</p>

        <h2 className="auth-kicker">What we store</h2>
        <p className="auth-lede">
          The photos you upload, the cut-out images produced from them, and the details you record
          about each piece — name, brand, colour, tags, occasion and value. We also store your email
          address and, if you use a card, a billing reference held by our payment provider.
        </p>

        <h2 className="auth-kicker">Who can see it</h2>
        <p className="auth-lede">
          Only you. Every photo lives in private storage, reachable only through short-lived links
          issued to your signed-in session. Nothing in your wardrobe is public, and there are no
          shareable image URLs unless you ask for one.
        </p>

        <h2 className="auth-kicker">AI processing</h2>
        <p className="auth-lede">
          When you import a piece, the photo is sent to our AI provider to identify the garment and
          separate it from the background. Images are sent for that request only. They are never
          used to train models, and we do not send your photos anywhere else.
        </p>

        <h2 className="auth-kicker">Export and deletion</h2>
        <p className="auth-lede">
          You can export your whole wardrobe as a data file with its images at any time, and you can
          delete your account from settings. Deletion removes your garments, outfits, wishlist and
          every stored image. Billing records are kept only as long as the law requires.
        </p>

        <h2 className="auth-kicker">Contact</h2>
        <p className="auth-lede">
          Questions or a data request? Reach us from the <Link to="/support">support page</Link>.
        </p>

        <p className="auth-alt">
          <Link to="/">Back to Wardrobe</Link>
        </p>
      </article>
    </main>
  );
}
