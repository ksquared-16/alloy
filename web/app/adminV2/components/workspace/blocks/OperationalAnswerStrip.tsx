"use client";

import type { OperationalAnswer } from "@/lib/ui-v2/workspace-types";

type StripProps = {
  answers: OperationalAnswer[];
  /** 3–5 for Workspace Header; 2–4 for Work Unit Header. */
  maxVisible?: number;
  presentation?: "compact";
};

export default function OperationalAnswerStrip({
  answers,
  maxVisible = 5,
  presentation: _presentation = "compact",
}: StripProps) {
  const visible = answers.slice(0, maxVisible);

  return (
    <div className="alloy-answer-strip alloy-answer-strip--compact" role="group" aria-label="Operational signals">
      {visible.length === 0 ? (
        <div className="alloy-ci alloy-ci--empty" role="listitem">
          <span className="alloy-ci__empty-msg">No signals configured</span>
        </div>
      ) : (
        visible.map((answer) => <CompactInstrument key={answer.key} answer={answer} />)
      )}
    </div>
  );
}

function CompactInstrument({ answer }: { answer: OperationalAnswer }) {
  const hasDrill = Boolean(answer.recommendedDrill);
  const drillLabel = answer.recommendedDrill?.label;

  const classes = [
    "alloy-ci",
    `alloy-ci--${answer.state}`,
    answer.lane === "ai" ? "alloy-ci--ai" : "",
    hasDrill ? "alloy-ci--drillable" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role={hasDrill ? "button" : "listitem"}
      tabIndex={hasDrill ? 0 : undefined}
      aria-label={
        hasDrill
          ? `${answer.label}: ${answer.answer}, ${answer.primaryValue}. ${drillLabel}`
          : `${answer.label}: ${answer.answer}, ${answer.primaryValue}`
      }
    >
      {/* Category label — muted, structural */}
      <span className="alloy-ci__label">{answer.label}</span>

      {/* Answer slot — semantic text at rest, drill CTA on hover */}
      <span className="alloy-ci__answer-wrap">
        <span className="alloy-ci__answer">
          <span className="alloy-ci__dot" aria-hidden="true" />
          {answer.answer}
        </span>
        {hasDrill && (
          <span className="alloy-ci__answer-drill" aria-hidden="true">
            {drillLabel} →
          </span>
        )}
      </span>

      {/* Value — supporting the answer, always structural Forge */}
      <span
        className="alloy-ci__value"
        aria-hidden="true"
      >
        {answer.primaryValue}
      </span>
    </div>
  );
}
