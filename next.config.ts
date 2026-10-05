import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable gzip compression
  compress: true,

  // Image optimization — allow R2/CF image domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-**.r2.dev",
      },
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
    // Prefer AVIF for better compression
    formats: ["image/avif", "image/webp"],
  },

  // Headers for security + caching
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
