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
    <div className={`flex flex-1 flex-col w-full min-w-0 ${className}`.trim()}>{children}</div>
  );
}
