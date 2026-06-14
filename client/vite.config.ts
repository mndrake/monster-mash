import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    // host: true exposes the dev server on your local network (LAN) so phones
    // on the same wifi can open it at http://<your-computer-ip>:5173
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 5173,
  },
  plugins: [
    // Turns the site into an installable PWA: generates the web app manifest
    // and a minimal service worker that caches the built assets for offline /
    // home-screen use. "autoUpdate" quietly refreshes the cache on new builds.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Monster Mash",
        short_name: "MonsterMash",
        description: "A tiny top-down arena you can play with friends on the same wifi.",
        theme_color: "#1b1b2f",
        background_color: "#10101a",
        display: "fullscreen",
        orientation: "landscape",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
