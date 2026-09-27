import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import heartRateApi from "./server/heartRateApi.js";
import patientApi from "./server/patientApi.js";

export default defineConfig({
  plugins: [
    react(),

    // Must run before patientApi,
    // because patientApi owns the
    // broader /api/* namespace.
    heartRateApi(),

    patientApi(),
  ],

  server: {
    host: true,

    watch: {
      ignored: [
        "**/data/**",
      ],
    },
  },
});