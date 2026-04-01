"use client";

/**
 * Shared wrapper for public-site pages. Background + ambient are provided by `public-site-chrome`
 * in ConditionalSiteLayout; this only sizes content in the main column.
 */
export default function PublicPageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex w-full max-w-full flex-1 flex-col self-stretch ${className}`.trim()}>{children}</div>
  );
}
