import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the client runs on :5173 and proxies Socket.IO to the server on :3001,
// so the browser sees a single origin (no CORS). In prod the server serves the
// built files directly, so the socket connects to the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
