import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@rentbrown/ui",
    "@rentbrown/design-tokens",
    "@rentbrown/types",
    "@rentbrown/utils",
    "@rentbrown/mock-data",
    "@rentbrown/supabase",
    "@rentbrown/validation",
  ],
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
