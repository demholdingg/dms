import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  // modul native SQLite tidak boleh di-bundle
  serverExternalPackages: ["better-sqlite3", "nodemailer"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
