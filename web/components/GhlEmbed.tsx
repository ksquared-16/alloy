"use client";

import { useEffect } from "react";

interface GhlEmbedProps {
  src: string;
  title: string;
  height?: number;
  id?: string;
  className?: string;
}

export default function GhlEmbed({
  src,
  title,
  height = 800,
  id,
  className = "",
}: GhlEmbedProps) {
  useEffect(() => {
    // Initialize GHL forms if script is loaded
    if (typeof window !== "undefined" && (window as any).LeadConnector) {
      (window as any).LeadConnector.init();
    }
  }, []);

  // If className contains height classes, don't set inline style (let Tailwind handle it)
  const hasHeightClass = className.includes("min-h-") || className.includes("h-");
  const style = hasHeightClass ? undefined : { minHeight: `${height}px` };

  return (
    <iframe
      id={id}
      src={src}
      title={title}
      className={`w-full border-none rounded-xl ${className}`}
      style={style}
      loading="lazy"
    />
  );
}

