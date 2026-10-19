import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "exceljs", "unpdf"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
