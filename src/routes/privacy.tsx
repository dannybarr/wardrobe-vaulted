import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — Wardrobe" },
      {
        name: "description",
        content:
          "How Wardrobe handles your garment photos, resale estimates and account under UK GDPR, and how to export or delete everything.",
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
      <article className="auth-card" style={{ maxWidth: 720 }}>
        <p className="auth-wordmark">
          WARDROBE<span>®</span>
        </p>
        <p className="auth-kicker">Privacy notice</p>
        <h1>Your wardrobe is yours.</h1>
        <p className="auth-lede">
          Last updated 19 October 2026. This notice is written for people in the United Kingdom.
        </p>

        <h2 className="auth-kicker">Who is responsible</h2>
        <p className="auth-lede">
          Wardrobe is operated by Danny Barr, an individual in the United Kingdom. He is the
          controller of the personal data the service holds. There is no separate company.
          Questions, access requests and complaints go through the{" "}
          <Link to="/support">support page</Link>.
        </p>

        <h2 className="auth-kicker">What we store</h2>
        <p className="auth-lede">
          Account email and display name. The photos you upload, the cut-outs made from them, and
          the details you record: name, brand, size, colour, condition, purchase price and date,
          wear count, and a resale estimate in pounds. Outfits and wishlist items, including product
          links you ask us to read. A billing reference held by Stripe if you pay. If you save your
          own OpenAI key, it is stored encrypted and is not shown back to you in full. A signed
          cookie identifies a no-login trial on this browser. We do not sell your data.
        </p>

        <h2 className="auth-kicker">Why we use it</h2>
        <p className="auth-lede">
          We process the wardrobe so we can provide the service you asked for (UK GDPR Article
          6(1)(b)). We use limited records to keep the service secure, cap trial abuse and meet tax
          rules (Article 6(1)(c) and (f)). Marketing email is sent only if you opt in, and you can
          withdraw that at any time (Article 6(1)(a)). Photos are not special-category data by
          default, but a photo of you wearing clothes can identify you. We treat those images as
          personal data and keep them in private storage.
        </p>

        <h2 className="auth-kicker">Photos and AI</h2>
        <p className="auth-lede">
          When you import or value a piece, the photo and the details needed for that request are
          sent to an AI provider: the Lovable AI gateway, or OpenAI if you have saved your own key.
          The request is to identify the item, lift it off the background, or describe it for a
          resale estimate. We do not use your photos to train our own models, and we do not send
          them to anyone else for advertising. Providers may process the request outside the United
          Kingdom. Where they do, we rely on the provider&apos;s international transfer safeguards.
          AI output is an estimate, not a valuation you can rely on for a sale.
        </p>

        <h2 className="auth-kicker">Who else sees it</h2>
        <p className="auth-lede">
          Your wardrobe is private. Photos sit in private storage and are shown with short-lived
          links for your signed-in session. We use Supabase for the database, authentication and
          file storage, Stripe for card payments, and Cloudflare to host the app and, if enabled, to
          check that a trial request comes from a person. Those processors act on our instructions
          for the service. A share card is created in your browser; it leaves the device only if you
          save or post it yourself.
        </p>

        <h2 className="auth-kicker">How long we keep it</h2>
        <p className="auth-lede">
          Wardrobe data stays until you delete the account or a piece. Deletion removes your
          garments, outfits, wishlist and stored images, then the login. Stripe billing records are
          kept for as long as UK tax law requires. Trial cookies last 30 days. Server logs used to
          investigate abuse are kept only as long as needed for that purpose.
        </p>

        <h2 className="auth-kicker">Your rights</h2>
        <p className="auth-lede">
          You can ask for access, correction, erasure, restriction, and a portable copy, and you can
          object to processing based on legitimate interests. Export and deletion are in the profile
          menu: &quot;Download my data&quot; saves a JSON file of your account, and &quot;Delete
          account&quot; removes it after you type DELETE. You can also write via the support page.
          You may complain to the Information Commissioner&apos;s Office at ico.org.uk. We will not
          discriminate against you for exercising these rights.
        </p>

        <h2 className="auth-kicker">Age</h2>
        <p className="auth-lede">
          Wardrobe is for people aged 18 and over. We do not knowingly create accounts for children.
        </p>

        <p className="auth-alt">
          <Link to="/">Back to Wardrobe</Link>
        </p>
      </article>
    </main>
  );
}
