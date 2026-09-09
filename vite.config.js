import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api/google-places": {
        target: "https://places.googleapis.com",
        changeOrigin: true,
        // Windows local TLS can fail with "unable to verify the first certificate".
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/google-places/, ""),
      },
      "/api/foursquare": {
        target: "https://places-api.foursquare.com",
        changeOrigin: true,
        // Windows local TLS can fail with "unable to verify the first certificate".
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/foursquare/, ""),
      },
    },
  },
});
