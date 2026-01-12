"use client";

export default function StagingBanner() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;

  if (appEnv !== "staging") {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-2 px-4 font-bold text-sm shadow-lg">
      STAGING — NOT PRODUCTION
    </div>
  );
}

