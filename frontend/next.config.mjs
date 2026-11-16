/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone so the container image only needs the server bundle.
  output: "standalone"
};

export default nextConfig;
