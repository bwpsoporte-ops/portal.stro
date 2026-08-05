import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  serverExternalPackages: ["pdfkit"],

  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
