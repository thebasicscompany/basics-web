import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@basics/contracts", "@basics/db", "@basics/tutor"],
};

export default nextConfig;
