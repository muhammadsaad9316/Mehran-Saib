const value = process.env.LABTRACK_API_ORIGIN;
let backend;
try {
  backend = new URL(value);
} catch {
  throw new Error(
    "Set LABTRACK_API_ORIGIN to your Node backend's HTTPS origin before deploying.",
  );
}
if (
  backend.protocol !== "https:" ||
  backend.pathname !== "/" ||
  backend.search ||
  backend.hash ||
  backend.username ||
  backend.password
)
  throw new Error(
    "LABTRACK_API_ORIGIN must be a plain HTTPS origin without credentials, paths or query parameters.",
  );

export const config = {
  framework: "vite",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  rewrites: [
    { source: "/api/:path*", destination: `${backend.origin}/api/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ],
  headers: [
    {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};
