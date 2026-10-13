export const config = {
  framework: "vite",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  regions: ["bom1"],
  functions: { "api/index.ts": { maxDuration: 60 } },
  rewrites: [
    { source: "/api/:path*", destination: "/api/index" },
    { source: "/(.*)", destination: "/index.html" },
  ],
  headers: [
    { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};
