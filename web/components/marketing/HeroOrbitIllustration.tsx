"use client";

import Image from "next/image";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  ListTodo,
  MessageSquare,
  Scale,
} from "lucide-react";
import { MARKETING_ASSETS, MARKETING_BRAND } from "@/lib/marketing/artifactPaths";

/**
 * Hero visual — jumbled work objects resolve into one continuous forward path.
 * Alloy brandmark is identity along the progression, not a routing hub.
 */

/** One continuous path across the composition (viewBox 1024×520). */
const FLOW_PATH =
  "M 210 290 C 280 290, 320 170, 420 170 C 520 170, 560 350, 650 340 C 740 330, 800 210, 900 210 C 930 210, 950 210, 978 210";

/** Same work objects as Stitching — jumbled on the left as unstructured input. */
const INPUT_CLUSTER = [
  { Icon: ClipboardList, left: "6%", top: "38%", delay: "0ms" },
  { Icon: FileText, left: "14%", top: "22%", delay: "40ms" },
  { Icon: MessageSquare, left: "4%", top: "58%", delay: "70ms" },
  { Icon: ListTodo, left: "18%", top: "52%", delay: "100ms" },
  { Icon: Scale, left: "11%", top: "72%", delay: "130ms" },
  { Icon: CheckCircle2, left: "20%", top: "36%", delay: "160ms" },
] as const;

export default function HeroOrbitIllustration({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`marketing-hero-art relative w-full ${className}`.trim()}
      aria-label={MARKETING_ASSETS.hero.alt}
    >
      <div
        className="marketing-hero-art__frame relative w-full overflow-visible"
        style={{ aspectRatio: "1024 / 520" }}
      >
        <svg
          className="marketing-hero-svg absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 1024 520"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="marketing-hero-flow-grad"
              x1="210"
              y1="290"
              x2="978"
              y2="210"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="rgba(39, 63, 82, 0.22)" />
              <stop offset="42%" stopColor="rgba(39, 63, 82, 0.28)" />
              <stop offset="72%" stopColor="rgba(0, 162, 131, 0.55)" />
              <stop offset="100%" stopColor="rgba(0, 162, 131, 0.95)" />
            </linearGradient>
          </defs>

          <path
            d={FLOW_PATH}
            stroke="rgba(39, 63, 82, 0.08)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />

          <path
            className="marketing-hero-flow"
            d={FLOW_PATH}
            stroke="url(#marketing-hero-flow-grad)"
            strokeWidth="2.25"
            strokeLinecap="round"
            fill="none"
            pathLength={1}
          />

          <path
            className="marketing-hero-arrow"
            d="M958 198 L982 210 L958 222"
            stroke="var(--color-alloy-bend-pine)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        {/* Unstructured work objects — same set as Stitching, jumbled at the start */}
        {INPUT_CLUSTER.map(({ Icon, left, top, delay }) => (
          <span
            key={`${left}-${top}`}
            className="marketing-hero-moment marketing-hero-moment--input pointer-events-none absolute text-alloy-midnight-forge/65"
            style={{
              left,
              top,
              ["--hero-glyph-delay" as string]: delay,
            }}
          >
            <Icon aria-hidden className="h-5 w-5 md:h-[1.375rem] md:w-[1.375rem]" strokeWidth={1.4} />
          </span>
        ))}

        {/* Alloy identity along the path */}
        <div
          className="marketing-hero-mark pointer-events-none absolute"
          style={{ left: "52%", top: "58%" }}
        >
          <Image
            src={MARKETING_BRAND.brandmark}
            alt=""
            width={120}
            height={116}
            priority
            className="h-[4.25rem] w-auto md:h-[5.25rem] xl:h-[5.75rem]"
          />
        </div>

        {/* Outcome */}
        <span
          className="marketing-hero-moment marketing-hero-moment--outcome pointer-events-none absolute text-alloy-bend-pine"
          style={{ left: "86%", top: "32%" }}
        >
          <CheckCircle2 aria-hidden className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.5} />
        </span>
      </div>
    </figure>
  );
}
