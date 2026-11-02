import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Policy PDF uploads go through a server action; allow 10 MB files plus form overhead.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  // Cache Components / partial prefetching are off: every page here depends on the
  // logged-in user, so there's no static shell worth prerendering.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
