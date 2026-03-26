import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'my.nilam.auto',
  appName: 'Nilam Auto',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'https://nilam-auto.vercel.app',
    cleartext: false,
  },
};

export default config;
