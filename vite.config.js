import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import patientApi from './server/patientApi.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), patientApi()],
  server: {
    // Saving data/patients.json should not reload the page
    watch: { ignored: ['**/data/**'] },
  },
})
