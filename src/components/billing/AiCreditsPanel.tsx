import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import {
  getAiCreditState,
  removeOwnAiKey,
  saveOwnAiKey,
  setAiMode,
} from "@/lib/ai-credits.functions";
import { AI_CREDIT_PACKS, estimateAiCost, formatPence, IMPORT_STAGES } from "@/lib/ai/pricing";

/**
 * The AI side of billing: prepaid credit for the built-in AI, or a member's own
 * OpenAI key instead. Prices shown here are the same figures the wardrobe quotes
 * before an upload runs.
 */
export function AiCreditsPanel() {
  const fetchState = useServerFn(getAiCreditState);
  const saveKey = useServerFn(saveOwnAiKey);
  const clearKey = useServerFn(removeOwnAiKey);
  const switchMode = useServerFn(setAiMode);
  const queryClient = useQueryClient();

  const [pack, setPack] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["ai-credits"], queryFn: () => fetchState({}) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ai-credits"] });

  const key = useMutation({
    mutationFn: async () => saveKey({ data: { key: keyInput } }),
    onSuccess: () => {
      setKeyInput("");
      setError(null);
      setNotice("Your own key is in use. Imports will be billed by OpenAI directly.");
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeKey = useMutation({
    mutationFn: async () => clearKey({}),
    onSuccess: () => {
      setNotice("Back on the built-in AI.");
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (mode: "builtin" | "byok") => switchMode({ data: { mode } }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const perPiece = estimateAiCost(IMPORT_STAGES, 3 * 1024 * 1024);
  const mode = data?.mode ?? "builtin";

  return (
    <section className="ai-credits">
      <p className="auth-kicker">Styling AI</p>

      {data?.founder ? (
        <p className="auth-lede">
          Founder account — the built-in AI runs at the full quality settings, free of charge.
        </p>
      ) : (
        <>
          <p className="auth-lede">
            Imports run on the built-in AI: the same models and the same quality settings as before,
            kept inside Wardrobe. A typical piece costs about{" "}
            <strong>{formatPence(perPiece.chargedPence)}</strong> — the AI's own cost plus a 20%
            service charge. You'll see the exact figure and confirm it before anything runs.
          </p>

          <div className="ai-credits__balance">
            <span>Balance</span>
            <strong>{formatPence(data?.balancePence ?? 0)}</strong>
            <small>
              {mode === "byok"
                ? "Not in use while your own key is connected"
                : `about ${Math.floor((data?.balancePence ?? 0) / perPiece.chargedPence)} more pieces`}
            </small>
          </div>

          {mode === "builtin" ? (
            <>
              <p className="ai-credits__label">Top up</p>
              <div className="ai-credits__packs">
                {AI_CREDIT_PACKS.map((option) => (
                  <button
                    key={option.priceId}
                    type="button"
                    className={`ai-credits__pack${pack === option.priceId ? " is-active" : ""}`}
                    onClick={() => setPack(option.priceId)}
                  >
                    {formatPence(option.pence)}
                  </button>
                ))}
              </div>
              {pack ? (
                <StripeEmbeddedCheckout
                  priceId={pack}
                  purpose="ai_credits"
                  returnUrl={`${window.location.origin}/billing?topup=complete`}
                />
              ) : null}
            </>
          ) : null}

          <p className="ai-credits__label">Your own OpenAI key</p>
          {data?.keyHint ? (
            <div className="ai-credits__key">
              <span>{data.keyHint}</span>
              <button
                type="button"
                className="auth-link-button"
                onClick={() => toggle.mutate(mode === "byok" ? "builtin" : "byok")}
                disabled={toggle.isPending}
              >
                {mode === "byok" ? "Use built-in AI" : "Use my key"}
              </button>
              <button
                type="button"
                className="auth-link-button"
                onClick={() => removeKey.mutate()}
                disabled={removeKey.isPending}
              >
                Remove
              </button>
            </div>
          ) : (
            <form
              className="ai-credits__key-form"
              onSubmit={(event) => {
                event.preventDefault();
                key.mutate();
              }}
            >
              <input
                type="password"
                placeholder="sk-…"
                autoComplete="off"
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
              />
              <button type="submit" className="auth-link-button" disabled={key.isPending}>
                {key.isPending ? "Saving…" : "Save key"}
              </button>
            </form>
          )}
          <p className="ai-credits__fine">
            Bring your own key and OpenAI bills you directly — no service charge from us. Your key is
            stored encrypted at rest and is never sent to your browser again.
          </p>
        </>
      )}

      {data?.usage?.length ? (
        <>
          <p className="ai-credits__label">Recent AI</p>
          <ul className="ai-credits__usage">
            {data.usage.map((row) => (
              <li key={row.id}>
                <span>{row.kind.replace(/_/g, " ")}</span>
                <span>{new Date(row.created_at).toLocaleDateString("en-GB")}</span>
                <span>{formatPence(row.charged_pence)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {error ? <p className="auth-message auth-message--error">{error}</p> : null}
      {notice && !error ? <p className="auth-message">{notice}</p> : null}
    </section>
  );
}
