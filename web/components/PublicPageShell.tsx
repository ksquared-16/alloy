"use client";

import HomeAmbient from "@/components/HomeAmbient";

/**
 * Shared shell for public-site pages: same atmospheric background and spec field as homepage.
 * Keeps /services/cleaning, /gutters, /about, /join in the same visual family.
 */
export default function PublicPageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-screen home-page ${className}`.trim()}>
      <HomeAmbient />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
