import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@basics/contracts", "@basics/db", "@basics/harness"],
};

export default nextConfig;
