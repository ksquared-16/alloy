"use client";

import Image from "next/image";
import {
  Activity,
  FileCheck,
  FileText,
  Flag,
  MessageSquare,
  Radar,
  Shield,
  UserRound,
} from "lucide-react";
import { useMarketingInView } from "@/components/marketing/useMarketingInView";
import { MARKETING_BRAND } from "@/lib/marketing/artifactPaths";

const CAPABILITIES = [
  {
    key: "business-processes",
    title: "Business Processes",
    description: "Organize how work advances.",
    Icon: Flag,
  },
  {
    key: "processing",
    title: "Processing & Actions",
    description: "Turn information into operational progress.",
    Icon: FileCheck,
  },
  {
    key: "communications",
    title: "Communications & Work",
    description: "Keep conversations and actions connected to the work.",
    Icon: MessageSquare,
  },
] as const;

const FOUNDATION = [
  { key: "records", label: "Records", Icon: FileText },
  { key: "identity", label: "Identity", Icon: UserRound },
  { key: "permissions", label: "Permissions", Icon: Shield },
  { key: "audit", label: "Audit", Icon: Activity },
] as const;

/**
 * Shared Alloy platform foundation — native visual for /platform.
 *
 * Communicates: different operational capabilities run on one foundation
 * (records, identity, permissions, audit), with Operational Intelligence
 * spanning the shared operating model — not a BP stage diagram or hub.
 */
export default function PlatformFoundationVisual() {
  const { ref, ready, armed, reducedMotion } = useMarketingInView<HTMLDivElement>({
    threshold: 0.18,
    rootMargin: "0px 0px -48px 0px",
  });

  return (
    <div
      ref={ref}
      data-ready={ready ? "true" : "false"}
      data-armed={armed ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      className="marketing-platform-foundation w-full"
      aria-label="Alloy platform foundation: shared records, identity, permissions, and audit supporting Business Processes, Processing and Actions, and Communications and Work, with Operational Intelligence spanning the operation"
    >
      {/* Desktop / tablet composition */}
      <div className="marketing-platform-foundation__desktop hidden md:block">
        {/* Operational Intelligence — spanning signal, not a fourth column */}
        <div className="marketing-platform-foundation__oi relative mb-6 lg:mb-7">
          <div className="flex items-center justify-center gap-2.5">
            <Radar
              className="h-4 w-4 text-alloy-bend-pine"
              strokeWidth={1.6}
              aria-hidden
            />
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge">
              Operational Intelligence
            </p>
          </div>
          <div className="marketing-platform-foundation__oi-line relative mt-2.5 h-px w-full overflow-hidden">
            <span className="marketing-platform-foundation__oi-stroke absolute inset-y-0 left-0 block h-px w-full bg-gradient-to-r from-transparent via-alloy-bend-pine/70 to-transparent" />
          </div>
          <p className="mt-1.5 text-center text-[0.8125rem] text-alloy-slate">
            Sees across the entire operation
          </p>
        </div>

        {/* Three operating capabilities rising from the foundation */}
        <div className="marketing-platform-foundation__capabilities relative grid grid-cols-3 gap-4 lg:gap-8">
          {CAPABILITIES.map((cap, index) => (
            <div
              key={cap.key}
              className="marketing-platform-foundation__capability relative flex flex-col items-center text-center"
              style={{ ["--pf-cap" as string]: index }}
            >
              <div className="flex h-11 w-11 items-center justify-center">
                <cap.Icon
                  className="h-6 w-6 text-alloy-midnight-forge"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
              <p className="mt-2.5 text-sm font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
                {cap.title}
              </p>
              <p className="mt-1 max-w-[16rem] text-[0.8125rem] leading-snug text-alloy-slate">
                {cap.description}
              </p>
              {/* Vertical continuity into the shared foundation — not a card edge */}
              <div
                aria-hidden
                className="marketing-platform-foundation__riser mt-3.5 h-7 w-px bg-gradient-to-b from-alloy-midnight-forge/20 to-alloy-midnight-forge/45 lg:mt-4 lg:h-8"
              />
            </div>
          ))}
        </div>

        {/* Shared foundation — one continuous base */}
        <div className="marketing-platform-foundation__base relative -mt-px">
          <div className="marketing-platform-foundation__plinth relative overflow-hidden rounded-sm border border-alloy-midnight-forge/[0.12] bg-white px-4 py-3.5 lg:px-6 lg:py-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-alloy-midnight-forge/20"
            />
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-2.5">
                <Image
                  src={MARKETING_BRAND.brandmark}
                  alt=""
                  width={22}
                  height={22}
                  className="marketing-platform-foundation__mark h-[22px] w-[22px] shrink-0 opacity-90"
                  aria-hidden
                />
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge/55">
                  Shared foundation
                </p>
              </div>
              <ul className="mt-2.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:gap-x-8">
                {FOUNDATION.map((item, index) => (
                  <li
                    key={item.key}
                    className="marketing-platform-foundation__pillar flex items-center gap-2"
                    style={{ ["--pf-pillar" as string]: index }}
                  >
                    <item.Icon
                      className="h-3.5 w-3.5 shrink-0 text-alloy-midnight-forge/70"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                    <span className="text-[0.8125rem] font-medium text-alloy-midnight-forge">
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile recomposition — not a shrunk desktop diagram */}
      <div className="marketing-platform-foundation__mobile md:hidden">
        <div className="marketing-platform-foundation__oi">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-alloy-bend-pine" strokeWidth={1.6} aria-hidden />
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge">
              Operational Intelligence
            </p>
          </div>
          <div className="marketing-platform-foundation__oi-line relative mt-2.5 h-px w-full overflow-hidden">
            <span className="marketing-platform-foundation__oi-stroke absolute inset-y-0 left-0 block h-px w-full bg-alloy-bend-pine/65" />
          </div>
        </div>

        <ul className="mt-4 space-y-4">
          {CAPABILITIES.map((cap, index) => (
            <li
              key={cap.key}
              className="marketing-platform-foundation__capability flex gap-3"
              style={{ ["--pf-cap" as string]: index }}
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
                <cap.Icon
                  className="h-5 w-5 text-alloy-midnight-forge"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
                  {cap.title}
                </p>
                <p className="mt-1 text-[0.8125rem] leading-snug text-alloy-slate">
                  {cap.description}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="marketing-platform-foundation__base mt-4">
          <div className="marketing-platform-foundation__plinth rounded-sm border border-alloy-midnight-forge/[0.12] bg-white px-4 py-3.5">
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-2.5">
                <Image
                  src={MARKETING_BRAND.brandmark}
                  alt=""
                  width={20}
                  height={20}
                  className="marketing-platform-foundation__mark h-5 w-5 shrink-0 opacity-90"
                  aria-hidden
                />
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge/55">
                  Shared foundation
                </p>
              </div>
              <ul className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {FOUNDATION.map((item, index) => (
                  <li
                    key={item.key}
                    className="marketing-platform-foundation__pillar flex items-center gap-1.5"
                    style={{ ["--pf-pillar" as string]: index }}
                  >
                    <item.Icon
                      className="h-3.5 w-3.5 shrink-0 text-alloy-midnight-forge/70"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                    <span className="text-[0.8125rem] font-medium text-alloy-midnight-forge">
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
