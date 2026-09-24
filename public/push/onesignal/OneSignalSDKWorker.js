// Service worker de OneSignal. Vive en su propio sub-scope (/visitas-familia/push/onesignal/)
// para no chocar con el service worker de la PWA (vite-plugin-pwa), que ocupa /visitas-familia/.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')
