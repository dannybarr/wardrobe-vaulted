import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { acceptInvite } from "@/lib/invites.functions";

const SearchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Wardrobe" },
      {
        name: "description",
        content: "Sign in to your private Wardrobe, or redeem an invitation to the alpha.",
      },
      { property: "og:title", content: "Sign in — Wardrobe" },
      { property: "og:description", content: "Access your private Wardrobe." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

/** Only ever navigate to same-origin paths that came from our own links. */
function safePath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/wardrobe";
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const mode = search.mode ?? "signin";
  const destination = safePath(search.redirect);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Already signed in? Go straight through.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate({ to: destination, replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate, destination]);

  const setMode = (next: "signin" | "signup" | "forgot") => {
    setError("");
    setNotice("");
    navigate({ to: "/auth", search: { mode: next, ...(search.redirect ? { redirect: search.redirect } : {}) } });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice("Check your inbox for a link to set a new password.");
        return;
      }

      if (mode === "signup") {
        const result = await acceptInvite({
          data: {
            code: code.trim(),
            email: email.trim(),
            password,
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
          },
        });
        if (!result.ok) {
          setError(result.reason);
          return;
        }
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      navigate({ to: destination, replace: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      setError(
        /invalid login credentials/i.test(message)
          ? "That email and password don't match an account."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError("Google sign-in didn't complete. Please try again.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: destination, replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-wordmark">
          WARDROBE<span>®</span>
        </p>
        {mode !== "forgot" && (
          <div className="auth-tabs" role="tablist" aria-label="Sign in or sign up">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "is-active" : ""}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>
        )}
        <p className="auth-kicker">
          {mode === "signup" ? "Invitation only" : mode === "forgot" ? "Password reset" : "Private alpha"}
        </p>
        <h1>
          {mode === "signup"
            ? "Create your wardrobe."
            : mode === "forgot"
              ? "Set a new password."
              : "Welcome back."}
        </h1>
        <p className="auth-lede">
          {mode === "signup"
            ? "Wardrobe is in a small private alpha. Enter the invitation code you were sent, and we'll set up your account."
            : mode === "forgot"
              ? "We'll email you a link to choose a new password."
              : "Sign in to your wardrobe. Everything in it stays private to you."}
        </p>


        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "signup" && (
            <>
              <div className="auth-field">
                <label htmlFor="auth-code">Invitation code</label>
                <input
                  id="auth-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="auth-name">Your name</label>
                <input
                  id="auth-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                />
              </div>
            </>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {mode !== "forgot" && (
            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 10 : undefined}
                required
              />
              {mode === "signup" && <small>At least 10 characters.</small>}
            </div>
          )}

          {error && <p className="auth-message auth-message--error">{error}</p>}
          {notice && <p className="auth-message">{notice}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? "One moment…"
              : mode === "signup"
                ? "Create my wardrobe"
                : mode === "forgot"
                  ? "Email me a link"
                  : "Sign in"}
          </button>
        </form>

        {mode !== "forgot" && (
          <>
            <p className="auth-divider">OR</p>
            <button className="auth-oauth" type="button" onClick={onGoogle} disabled={busy}>
              Continue with Google
            </button>
          </>
        )}

        {mode === "signin" && (
          <p className="auth-alt">
            New here? <button type="button" onClick={() => setMode("signup")}>Create an account</button>
            {" · "}
            <button type="button" onClick={() => setMode("forgot")}>Forgot password</button>
          </p>
        )}
        {mode === "signup" && (
          <p className="auth-alt">
            Already have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button>
          </p>
        )}

        {mode === "forgot" && (
          <p className="auth-alt">
            <button type="button" onClick={() => setMode("signin")}>Back to sign in</button>
          </p>
        )}

        <p className="auth-note">
          By continuing you agree to our <Link to="/terms">terms</Link> and{" "}
          <Link to="/privacy">privacy notice</Link>. Your garment photos are stored privately and are
          never used to train models.
        </p>
      </div>
    </main>
  );
}
