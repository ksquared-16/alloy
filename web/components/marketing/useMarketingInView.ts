"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  /** Fraction of element visibility required (0–1). */
  threshold?: number;
  /** Root margin to trigger slightly early. */
  rootMargin?: string;
  /** Fire once (default true). */
  once?: boolean;
};

/**
 * Lightweight marketing in-view trigger.
 *
 * Progressive enhancement:
 * - Before mount / no-JS: consumers should render the final visible state.
 * - After mount (motion OK): `armed` becomes true so CSS can hide until `ready`.
 * - Reduced-motion: `ready` immediately, never arm for choreography.
 */
export function useMarketingInView<T extends HTMLElement = HTMLElement>(
  options: Options = {},
) {
  const { threshold = 0.12, rootMargin = "0px 0px -40px 0px", once = true } = options;
  const ref = useRef<T | null>(null);
  const [ready, setReady] = useState(false);
  const [armed, setArmed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const reduced = mq.matches;
      setReducedMotion(reduced);
      if (reduced) {
        setArmed(false);
        setReady(true);
      } else {
        setArmed(true);
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || !armed) return;
    const node = ref.current;
    if (!node) return;

    // If already on screen at mount, reveal promptly
    // If already intersecting at observe-time, reveal promptly.
    // Some browsers defer the first callback; check getBoundingClientRect fallback.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setReady(true);
        if (once) observer.disconnect();
      },
      { threshold, rootMargin },
    );
    observer.observe(node);

    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    if (rect.top < vh * 0.92 && rect.bottom > vh * 0.08) {
      setReady(true);
      observer.disconnect();
    }
    return () => observer.disconnect();
  }, [armed, once, reducedMotion, rootMargin, threshold]);

  return { ref, ready, armed, reducedMotion } as const;
}
