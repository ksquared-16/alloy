"use client";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const isStaging = appEnv === "staging";

  return (
    <div className={isStaging ? "pt-10" : ""}>
      {children}
    </div>
  );
}

