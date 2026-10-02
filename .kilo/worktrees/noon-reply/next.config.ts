import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Only run Cloudflare dev bridge in development (requires macOS 13.5+ / Linux)
if (process.env.NODE_ENV === "development") {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev()).catch(() => {
    // Silently skip if Workers runtime is unavailable (e.g. older macOS)
  });
}
