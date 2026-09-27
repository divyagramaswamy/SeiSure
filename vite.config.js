import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import heartRateApi from "./server/heartRateApi.js";
import patientApi from "./server/patientApi.js";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    // Must come before patientApi because
    // patientApi handles the general /api/* namespace.
    heartRateApi(),

    patientApi(),
  ],

  server: {
    /*
     * Allows your iPhone on the same Wi-Fi network
     * to POST HealthKit samples to your Mac.
     */
    host: true,

    // Saving local patient data should not reload the page
    watch: {
      ignored: ["**/data/**"],
    },
  },
});
