/** @type {import('next').NextConfig} */


/*
Error: Invalid src prop (/logo-tether.svg) on `next/image`, hostname "cryptologos.cc" is not configured under images in your `next.config.js`
*/

const nextConfig = {
  // fixes wallet connect dependency issue https://docs.walletconnect.com/web3modal/nextjs/about#extra-configuration
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },

  images: {
    domains: [
      "cryptologos.cc", 
      "vzrcy5vcsuuocnf3.public.blob.vercel-storage.com",
      "cryptoss.beauty",
      "t0gqytzvlsa2lapo.public.blob.vercel-storage.com",
      "crypto-ex-vienna.vercel.app",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },

  /*
  eslint: {
    ignoreDuringBuilds: true,
  },
  */

  
  async redirects() {
    return [
      {
        source: '/',
        //destination: '/ko/administration/homepage',
        destination: '/en/p2p',
        permanent: true,
      },
    ]
  },
  
  // Allow pop-up windows (e.g., OAuth / web3 login) to call window.close
  // by relaxing COOP for opened tabs while keeping same-origin protections.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  

  
};

export default nextConfig;
