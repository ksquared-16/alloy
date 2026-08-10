"use client";

import { useEffect, useId, useState } from "react";
import { useMarketingInView } from "@/components/marketing/useMarketingInView";
import {
  getEvolutionPeriods,
  type EvolutionPeriod,
} from "@/lib/marketing/roadmap";

function canHover() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
}

function PeriodRollup({
  period,
  periodIndex,
  open,
  onOpen,
  onClose,
  onToggle,
  mobile = false,
}: {
  period: EvolutionPeriod;
  periodIndex: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  mobile?: boolean;
}) {
  const panelId = useId();
  const count = period.milestones.length;
  const label = count === 1 ? "1 milestone" : `${count} milestones`;

  return (
    <li
      className={
        mobile
          ? "marketing-roadmap-evolution__period relative grid grid-cols-[0.875rem_1fr] gap-x-3 py-3.5"
          : "marketing-roadmap-evolution__period relative w-auto min-w-0 flex-1 max-w-[12rem]"
      }
      style={{ ["--rm-period" as string]: periodIndex }}
      onMouseEnter={() => {
        if (canHover()) onOpen();
      }}
      onMouseLeave={() => {
        if (canHover()) onClose();
      }}
    >
      <span
        aria-hidden
        className={
          mobile
            ? "marketing-roadmap-evolution__dot relative z-[1] col-start-1 mt-1.5 h-2.5 w-2.5 rounded-full bg-alloy-bend-pine"
            : "marketing-roadmap-evolution__dot relative z-[1] mb-3 block h-2.5 w-2.5 rounded-full bg-alloy-bend-pine"
        }
      />

      <div className={mobile ? "col-start-2 min-w-0" : undefined}>
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-alloy-midnight-forge/50 md:text-[0.6875rem]">
          {period.label}
        </p>

        <button
          type="button"
          className={`mt-2 rounded-sm text-left text-sm font-medium tracking-[-0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 ${
            open
              ? "text-alloy-midnight-forge"
              : "text-alloy-midnight-forge/75 hover:text-alloy-midnight-forge"
          }`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          onFocus={onOpen}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && event.currentTarget.closest("li")?.contains(next)) return;
            onClose();
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`h-1 w-1 rounded-full ${
                open ? "bg-alloy-bend-pine" : "bg-alloy-midnight-forge/25"
              }`}
            />
            {label}
          </span>
        </button>

        {open ? (
          <div
            id={panelId}
            role="region"
            aria-label={`${period.label} milestones`}
            className={
              mobile
                ? "marketing-roadmap-evolution__detail relative z-20 mt-3 rounded-md border border-alloy-midnight-forge/[0.1] bg-white px-3.5 py-3 shadow-[0_10px_28px_rgba(24,39,58,0.12)]"
                : "marketing-roadmap-evolution__detail absolute left-0 top-[calc(100%+0.55rem)] z-30 w-[min(17.5rem,78vw)] rounded-md border border-alloy-midnight-forge/[0.1] bg-white px-3.5 py-3 shadow-[0_10px_28px_rgba(24,39,58,0.12)]"
            }
          >
            <ul className="space-y-2.5">
              {period.milestones.map((milestone) => (
                <li key={milestone.id}>
                  <p className="text-sm font-medium tracking-[-0.01em] text-alloy-midnight-forge">
                    {milestone.title}
                  </p>
                  {milestone.description ? (
                    <p className="mt-0.5 text-[0.8125rem] leading-snug text-alloy-slate">
                      {milestone.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Straight left→right chronology.
 * Default: period + milestone count. Hover / focus / tap reveals the rollup.
 */
export default function RoadmapEvolutionBands() {
  const periods = getEvolutionPeriods();
  const { ref, ready, armed, reducedMotion } = useMarketingInView<HTMLDivElement>({
    threshold: 0.08,
  });
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={ref}
      data-ready={ready ? "true" : "false"}
      data-armed={armed ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      className="marketing-roadmap-evolution"
    >
      <div className="marketing-roadmap-evolution__scroller relative">
        {/* Desktop / tablet — LTR chronology */}
        <div className="relative hidden md:block">
          <div
            aria-hidden
            className="marketing-roadmap-evolution__rail pointer-events-none absolute left-[10%] right-[10%] top-[0.4rem] h-px bg-alloy-stone"
          />
          <ol className="relative flex w-full items-start justify-between gap-4 lg:gap-6">
            {periods.map((period, periodIndex) => (
              <PeriodRollup
                key={period.key}
                period={period}
                periodIndex={periodIndex}
                open={openKey === period.key}
                onOpen={() => setOpenKey(period.key)}
                onClose={() => setOpenKey(null)}
                onToggle={() =>
                  setOpenKey((current) => (current === period.key ? null : period.key))
                }
              />
            ))}
          </ol>
        </div>

        {/* Mobile — vertical chronology (avoids clipping the rollup panel) */}
        <ol className="relative space-y-0 md:hidden">
          <span
            aria-hidden
            className="marketing-roadmap-evolution__rail pointer-events-none absolute top-2 bottom-2 left-[0.4375rem] w-px bg-alloy-stone"
          />
          {periods.map((period, periodIndex) => (
            <PeriodRollup
              key={period.key}
              period={period}
              periodIndex={periodIndex}
              open={openKey === period.key}
              onOpen={() => setOpenKey(period.key)}
              onClose={() => setOpenKey(null)}
              onToggle={() =>
                setOpenKey((current) => (current === period.key ? null : period.key))
              }
              mobile
            />
          ))}
        </ol>
      </div>

      <div className="mt-8 flex flex-col items-center text-center md:mt-10">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge/45">
          Today
        </p>
        <span
          aria-hidden
          className="mt-2 h-5 w-px bg-gradient-to-b from-alloy-midnight-forge/25 to-transparent"
        />
        <a
          href="#today"
          className="mt-1 text-sm font-semibold tracking-[-0.01em] text-alloy-bend-pine hover:underline"
        >
          Where Alloy stands today
        </a>
      </div>
    </div>
  );
}
