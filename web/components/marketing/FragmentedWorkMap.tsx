"use client";

import {
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageSquare,
  Scale,
  ListTodo,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/**
 * Unstructured work → structured progression.
 * Work objects (not software apps). No hub, no spider, no Alloy logo center.
 */

type WorkObject = {
  id: string;
  label: string;
  Icon: typeof FileText;
  /** Unstructured desktop */
  loose: { x: number; y: number };
  /** Structured desktop (aligned progression) */
  ordered: { x: number; y: number };
  /** Mobile unstructured */
  mLoose: { x: number; y: number };
  /** Mobile structured (vertical step) */
  mOrdered: { x: number; y: number };
};

const OBJECTS: WorkObject[] = [
  {
    id: "request",
    label: "Request",
    Icon: ClipboardList,
    loose: { x: 88, y: 78 },
    ordered: { x: 72, y: 110 },
    mLoose: { x: 48, y: 48 },
    mOrdered: { x: 180, y: 36 },
  },
  {
    id: "document",
    label: "Document",
    Icon: FileText,
    loose: { x: 210, y: 48 },
    ordered: { x: 210, y: 110 },
    mLoose: { x: 220, y: 40 },
    mOrdered: { x: 180, y: 88 },
  },
  {
    id: "message",
    label: "Message",
    Icon: MessageSquare,
    loose: { x: 340, y: 140 },
    ordered: { x: 348, y: 110 },
    mLoose: { x: 300, y: 110 },
    mOrdered: { x: 180, y: 140 },
  },
  {
    id: "task",
    label: "Task",
    Icon: ListTodo,
    loose: { x: 470, y: 58 },
    ordered: { x: 486, y: 110 },
    mLoose: { x: 70, y: 150 },
    mOrdered: { x: 180, y: 192 },
  },
  {
    id: "decision",
    label: "Decision",
    Icon: Scale,
    loose: { x: 560, y: 152 },
    ordered: { x: 624, y: 110 },
    mLoose: { x: 260, y: 190 },
    mOrdered: { x: 180, y: 244 },
  },
  {
    id: "approval",
    label: "Approval",
    Icon: CheckCircle2,
    loose: { x: 660, y: 90 },
    ordered: { x: 762, y: 110 },
    mLoose: { x: 140, y: 240 },
    mOrdered: { x: 180, y: 296 },
  },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function useScrollProgress(ref: RefObject<HTMLElement | null>, reduced: boolean) {
  const [progress, setProgress] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }

    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const start = vh * 0.82;
      const end = vh * 0.28;
      const span = Math.max(160, start - end + Math.min(rect.height * 0.45, vh * 0.35));
      const raw = (start - rect.top) / span;
      setProgress(smoothstep(raw));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced, ref]);

  return progress;
}

export default function FragmentedWorkMap() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const progress = useScrollProgress(ref, reduced);

  const phase = progress < 0.33 ? "unstructured" : progress < 0.72 ? "organizing" : "structured";
  const brokenOpacity = Math.max(0, 0.5 * (1 - progress / 0.55));
  const pathOpacity = Math.max(0, Math.min(1, (progress - 0.35) / 0.45));
  const resolveOpacity = Math.max(0, (progress - 0.58) / 0.42);

  return (
    <div
      ref={ref}
      className="marketing-stitch relative w-full"
      data-phase={phase}
      data-reduced={reduced ? "true" : "false"}
      style={{ ["--stitch-p" as string]: progress } as CSSProperties}
      aria-label="Unstructured work objects organize into a clear progression"
    >
      {/* Desktop — horizontal organize */}
      <div className="relative mx-auto hidden aspect-[840/185] w-full max-w-3xl md:block">
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 840 220"
          fill="none"
          aria-hidden
        >
          {/* Incomplete / broken relationship (unstructured) */}
          <path
            d="M200 70 C 280 40, 360 120, 450 80"
            stroke="currentColor"
            className="text-alloy-midnight-forge/25"
            strokeWidth="1.2"
            strokeDasharray="3 7"
            strokeLinecap="round"
            opacity={brokenOpacity}
          />
          <circle
            cx="320"
            cy="65"
            r="2.25"
            className="fill-alloy-ember/70"
            opacity={brokenOpacity}
          />

          {/* Emerging continuous progression */}
          <path
            d="M90 110 H 790"
            stroke="currentColor"
            className="text-alloy-bend-pine"
            strokeWidth="1.75"
            strokeLinecap="round"
            opacity={pathOpacity}
          />
          <path
            d="M778 100 L798 110 L778 120"
            stroke="currentColor"
            className="text-alloy-bend-pine"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={pathOpacity}
          />
        </svg>

        {OBJECTS.map((obj) => {
          const x = lerp(obj.loose.x, obj.ordered.x, progress);
          const y = lerp(obj.loose.y, obj.ordered.y, progress);
          const Icon = obj.Icon;
          return (
            <div
              key={obj.id}
              className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: `${(x / 840) * 100}%`, top: `${(y / 220) * 100}%` }}
            >
              <Icon
                aria-hidden
                className="h-5 w-5 text-alloy-midnight-forge"
                strokeWidth={1.45}
              />
              <span className="text-[0.6875rem] font-medium text-alloy-midnight-forge/55">
                {obj.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile — staggered → vertical progression */}
      <div className="relative mx-auto aspect-[360/270] w-full max-w-sm md:hidden">
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 360 330"
          fill="none"
          aria-hidden
        >
          <path
            d="M80 70 C 140 55, 200 120, 240 95"
            stroke="currentColor"
            className="text-alloy-midnight-forge/25"
            strokeWidth="1.15"
            strokeDasharray="3 6"
            opacity={brokenOpacity}
          />
          <circle
            cx="160"
            cy="72"
            r="2"
            className="fill-alloy-ember/70"
            opacity={brokenOpacity}
          />
          <path
            d="M180 44 V 310"
            stroke="currentColor"
            className="text-alloy-bend-pine"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity={pathOpacity}
          />
          <path
            d="M170 298 L180 316 L190 298"
            stroke="currentColor"
            className="text-alloy-bend-pine"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={pathOpacity}
          />
        </svg>

        {OBJECTS.map((obj) => {
          const x = lerp(obj.mLoose.x, obj.mOrdered.x, progress);
          const y = lerp(obj.mLoose.y, obj.mOrdered.y, progress);
          const Icon = obj.Icon;
          return (
            <div
              key={obj.id}
              className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: `${(x / 360) * 100}%`, top: `${(y / 330) * 100}%` }}
            >
              <Icon
                aria-hidden
                className="h-[1.125rem] w-[1.125rem] text-alloy-midnight-forge"
                strokeWidth={1.45}
              />
              <span className="text-[0.625rem] font-medium text-alloy-midnight-forge/55">
                {obj.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="mt-1.5 flex flex-col items-center gap-1 md:mt-2"
        style={{ opacity: Math.max(resolveOpacity, reduced ? 1 : 0) }}
      >
        <div className="h-px w-full max-w-xl bg-alloy-bend-pine/65" />
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-alloy-bend-pine">
          Connected work moves forward
        </p>
        <div
          aria-hidden
          className="h-3.5 w-px bg-gradient-to-b from-alloy-bend-pine/50 to-transparent md:h-4"
        />
      </div>
    </div>
  );
}
