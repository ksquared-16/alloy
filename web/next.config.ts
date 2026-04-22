import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      /** UI V2 lives under `app/adminV2/`; serve it under `/admin/v2` so middleware’s `/admin/*` allowlist applies (no separate /adminV2 rules needed). */
      { source: "/admin/v2", destination: "/adminV2/workspace" },
      { source: "/admin/v2/:path*", destination: "/adminV2/:path*" },
      /** Allow lowercase bookmarks in case-sensitive deploys. */
      { source: "/adminv2", destination: "/adminV2/workspace" },
      { source: "/adminv2/:path*", destination: "/adminV2/:path*" },
    ];
  },
};

export default nextConfig;
