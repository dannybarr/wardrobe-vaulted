import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Wardrobe" },
      {
        name: "description",
        content: "Get help with your Wardrobe account, imports, billing, data export or deletion.",
      },
      { property: "og:title", content: "Support — Wardrobe" },
      { property: "og:description", content: "Get help with your Wardrobe account." },
    ],
  }),
  component: Support,
});

function Support() {
  return (
    <main className="auth-page">
      <article className="auth-card" style={{ maxWidth: 560 }}>
        <p className="auth-wordmark">
          WARDROBE<span>®</span>
        </p>
        <p className="auth-kicker">Support</p>
        <h1>We'll help.</h1>
        <p className="auth-lede">
          Email <a href="mailto:hello@wardrobe.app">hello@wardrobe.app</a> and include the email
          address on your account. During the alpha we usually reply the same day.
        </p>
        <p className="auth-lede">
          For a copy of your data or to delete your account, you can do both yourself from settings
          once you're signed in — or ask us and we'll handle it.
        </p>
        <p className="auth-alt">
          <Link to="/privacy">Privacy notice</Link> · <Link to="/terms">Terms</Link> ·{" "}
          <Link to="/">Home</Link>
        </p>
      </article>
    </main>
  );
}
