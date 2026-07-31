import { useState } from "react";
import {
  estimateAiCost,
  formatPence,
  IMPORT_STAGES,
  type AiJobKind,
} from "@/lib/ai/pricing";

/**
 * An open cost estimator. Deliberately needs no account, no balance and no
 * purchase: a member can work out what adding their wardrobe will cost before
 * they are ever asked to buy credit. Uses the same pricing rules as the real
 * quote shown at upload time, so the figures agree.
 */

const SIZES = [
  { label: "Phone photo", bytes: 2 * 1024 * 1024, hint: "about 2 MB" },
  { label: "Large photo", bytes: 5 * 1024 * 1024, hint: "about 5 MB" },
  { label: "Full quality", bytes: 12 * 1024 * 1024, hint: "about 12 MB" },
] as const;

const COUNTS = [1, 5, 10, 25, 50] as const;

export function AiCostEstimator() {
  const [bytes, setBytes] = useState<number>(SIZES[0].bytes);
  const [count, setCount] = useState<number>(5);
  const [onModel, setOnModel] = useState(false);

  const stages: AiJobKind[] = onModel ? [...IMPORT_STAGES, "on_model"] : IMPORT_STAGES;
  const perPiece = estimateAiCost(stages, bytes);
  const total = perPiece.chargedPence * count;

  return (
    <div className="ai-estimator">
      <p className="ai-credits__label">What will it cost?</p>

      <div className="ai-estimator__row">
        <span className="ai-estimator__legend">Photo size</span>
        <div className="ai-estimator__options">
          {SIZES.map((size) => (
            <button
              key={size.label}
              type="button"
              className={`ai-credits__pack${bytes === size.bytes ? " is-active" : ""}`}
              onClick={() => setBytes(size.bytes)}
              title={size.hint}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ai-estimator__row">
        <span className="ai-estimator__legend">Pieces</span>
        <div className="ai-estimator__options">
          {COUNTS.map((option) => (
            <button
              key={option}
              type="button"
              className={`ai-credits__pack${count === option ? " is-active" : ""}`}
              onClick={() => setCount(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <label className="ai-estimator__toggle">
        <input
          type="checkbox"
          checked={onModel}
          onChange={(event) => setOnModel(event.target.checked)}
        />
        Include an on-model image for each piece
      </label>

      <div className="ai-estimator__result">
        <div>
          <span>Per piece</span>
          <strong>{formatPence(perPiece.chargedPence)}</strong>
        </div>
        <div>
          <span>
            {count} {count === 1 ? "piece" : "pieces"}
          </span>
          <strong>{formatPence(total)}</strong>
        </div>
      </div>

      <ul className="ai-confirm__stages">
        {perPiece.stages.map((stage) => (
          <li key={stage.kind}>
            <span>
              {stage.kind === "analyze"
                ? "Reading the photo"
                : stage.kind === "cutout"
                  ? "Cutting the piece out"
                  : "On-model image"}
            </span>
            <span>{formatPence(stage.chargedPence)}</span>
          </li>
        ))}
      </ul>

      <p className="ai-credits__fine">
        Estimates include the {perPiece.markupBps / 100}% service charge on the built-in AI. You are
        shown the exact figure and asked to confirm before any piece is processed, and nothing is
        charged if a run fails. On your own OpenAI key, none of this is charged by us — OpenAI bills
        you directly.
      </p>
    </div>
  );
}
