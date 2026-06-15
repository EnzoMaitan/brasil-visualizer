import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Brasil Visualizer frontend. Port 5173 per the root CLAUDE.md.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 5173 },
});
