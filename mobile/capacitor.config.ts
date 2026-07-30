import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.taxivanille.chauffeur',
  appName: 'Taxi Vanille',
  // Source unique : on empaquette le build de l'app web (web/dist),
  // plus l'ancien fork mobile/src (desormais inutilise).
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Mise a jour a distance (OTA) en mode manuel : le pilotage est fait
    // cote code (web/src/lib/ota.ts), pas par un serveur Capgo.
    CapacitorUpdater: {
      autoUpdate: false,
      // Si un nouvel APK est installe (nouvelle version native), on repart du
      // bundle embarque et l'OTA re-telecharge la derniere version au besoin.
      resetWhenUpdate: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FFFFFF',
    },
  },
};

export default config;
