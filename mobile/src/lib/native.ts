import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#FFFFFF' });
  } catch {
    // StatusBar not available
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  if (!isNative) return true;
  try {
    const status = await Geolocation.requestPermissions();
    return status.location === 'granted';
  } catch {
    return false;
  }
}

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if (isNative) {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    }
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export async function takePhoto(): Promise<{ dataUrl: string; file: Blob } | null> {
  if (!isNative) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });
    if (!photo.dataUrl) return null;
    const response = await fetch(photo.dataUrl);
    const blob = await response.blob();
    return { dataUrl: photo.dataUrl, file: blob };
  } catch {
    return null;
  }
}

export async function getNetworkStatus(): Promise<boolean> {
  if (!isNative) return navigator.onLine;
  const status = await Network.getStatus();
  return status.connected;
}

export function onNetworkChange(callback: (connected: boolean) => void): () => void {
  if (!isNative) {
    const onlineHandler = () => callback(true);
    const offlineHandler = () => callback(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }
  const handler = Network.addListener('networkStatusChange', (status) => {
    callback(status.connected);
  });
  return () => { handler.then((h) => h.remove()); };
}

export async function setPreference(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

export async function getPreference(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

export async function removePreference(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}
