import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TypeScript errors are ignored during build until `supabase gen types` is run
  // to generate proper database types from the real Supabase project
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
