import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { quoteAiRun } from "@/lib/ai-credits.functions";
import { formatPence, type AiJobKind } from "@/lib/ai/pricing";

const LABELS: Record<string, string> = {
  analyze: "Reading the photo",
  cutout: "Cutting the piece out",
  on_model: "On-model image",
  wishlist_resolve: "Reading the link",
};

type Props = {
  kinds: AiJobKind[];
  byteSize?: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Shown before any paid AI runs: the exact charge, what it covers, and a choice.
 * Nothing is charged until the member presses through this.
 */
export function AiCostConfirm({ kinds, byteSize = 0, onConfirm, onCancel }: Props) {
  const quote = useServerFn(quoteAiRun);
  const { data, isPending } = useQuery({
    queryKey: ["ai-quote", kinds.join("+"), byteSize],
    queryFn: () => quote({ data: { kinds, byteSize } }),
  });

  if (isPending || !data) {
    return (
      <div className="ai-confirm">
        <p className="ai-confirm__lede">Working out the cost…</p>
      </div>
    );
  }

  if (data.chargedPence === 0) {
    return (
      <div className="ai-confirm">
        <p className="ai-confirm__lede">
          {data.founder
            ? "Founder account — this runs free of charge."
            : "Running on your own OpenAI key. OpenAI bills you directly; we charge nothing."}
        </p>
        <div className="ai-confirm__actions">
          <button type="button" className="auth-submit" onClick={onConfirm}>
            Start
          </button>
          <button type="button" className="auth-link-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-confirm">
      <p className="ai-confirm__amount">{formatPence(data.chargedPence)}</p>
      <p className="ai-confirm__lede">
        AI cost {formatPence(data.costPence)} plus a {data.markupBps / 100}% service charge. Taken
        from your credit balance of {formatPence(data.balancePence)} when you start.
      </p>
      <ul className="ai-confirm__stages">
        {data.stages.map((stage) => (
          <li key={stage.kind}>
            <span>{LABELS[stage.kind] ?? stage.kind}</span>
            <span>{formatPence(stage.chargedPence)}</span>
          </li>
        ))}
      </ul>
      {data.affordable ? (
        <div className="ai-confirm__actions">
          <button type="button" className="auth-submit" onClick={onConfirm}>
            Confirm {formatPence(data.chargedPence)}
          </button>
          <button type="button" className="auth-link-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="ai-confirm__actions">
          <a className="auth-submit" href="/billing">
            Top up to continue
          </a>
          <button type="button" className="auth-link-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
