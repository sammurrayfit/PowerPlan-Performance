import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only PowerPlan itself and the ABCM AMS may show PowerPlan in a frame.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://abcm-ams.vercel.app" },
        ],
      },
    ];
  },
};

export default nextConfig;
