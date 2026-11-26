import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Policy PDF uploads go through a server action; allow 10 MB files plus form overhead.
  experimental: {
    globalNotFound: true,
    serverActions: { bodySizeLimit: "11mb" },
  },
  // Cache Components / partial prefetching are off: every page here depends on the
  // logged-in user, so there's no static shell worth prerendering.
  poweredByHeader: false,
  // Browser protections: no framing (clickjacking), no MIME sniffing, HTTPS only, no full URLs leaked to other sites.
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
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
