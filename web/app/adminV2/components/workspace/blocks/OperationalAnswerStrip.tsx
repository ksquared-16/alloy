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
  const stateClass = `alloy-ci--${answer.state}`;
  const laneClass = answer.lane === "ai" ? "alloy-ci--ai" : "";

  const trendIcon =
    answer.trend?.direction === "up"
      ? "↑"
      : answer.trend?.direction === "down"
        ? "↓"
        : "—";

  return (
    <div
      className={["alloy-ci", stateClass, laneClass].filter(Boolean).join(" ")}
      role="listitem"
    >
      <div className="alloy-ci__top">
        <span className="alloy-ci__dot" aria-hidden="true" />
        <span className="alloy-ci__label">{answer.label}</span>
      </div>

      <div className="alloy-ci__value" aria-label={`${answer.label}: ${answer.primaryValue}`}>
        {answer.primaryValue}
      </div>

      <div className="alloy-ci__answer">{answer.answer}</div>

      {answer.evidence && (
        <div className="alloy-ci__evidence">{answer.evidence}</div>
      )}

      <div className="alloy-ci__foot">
        {answer.trend && answer.trend.magnitude ? (
          <span
            className={`alloy-ci__trend alloy-ci__trend--${answer.trend.valence}`}
            aria-label={`Trend: ${answer.trend.direction} ${answer.trend.magnitude} ${answer.trend.window}`}
          >
            {trendIcon} {answer.trend.magnitude}
            {answer.trend.window ? ` ${answer.trend.window}` : ""}
          </span>
        ) : null}

        {answer.freshness.isLive ? (
          <span className="alloy-ci__fresh" aria-label="Live data">
            <span className="alloy-ci__live-dot" aria-hidden="true" />
            live
          </span>
        ) : answer.freshness.updatedAt ? (
          <span className="alloy-ci__fresh">{answer.freshness.updatedAt}</span>
        ) : null}
      </div>

      {answer.recommendedDrill && (
        <span className="alloy-ci__drill" aria-label={`Open ${answer.recommendedDrill.label}`}>
          {answer.recommendedDrill.label} ↗
        </span>
      )}
    </div>
  );
}
