import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jduitbuzomkwmzzyrjux.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/hostel-media/gallery/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
