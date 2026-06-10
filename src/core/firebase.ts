import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const appAlreadyExists = getApps().length > 0;
export const firebaseApp = appAlreadyExists ? getApp() : initializeApp(config);
export const auth = appAlreadyExists
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, { persistence: createAsyncStoragePersistence() });
export const db = getFirestore(firebaseApp);

function createAsyncStoragePersistence(): Persistence {
  class AsyncStoragePersistence {
    static type = "LOCAL";
    readonly type = "LOCAL";

    async _isAvailable() {
      try {
        const key = "firebase:persistence-test";
        await AsyncStorage.setItem(key, "1");
        await AsyncStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }

    _set(key: string, value: unknown) {
      return AsyncStorage.setItem(key, JSON.stringify(value));
    }

    async _get(key: string) {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    }

    _remove(key: string) {
      return AsyncStorage.removeItem(key);
    }

    _addListener() {}
    _removeListener() {}
  }

  return AsyncStoragePersistence as unknown as Persistence;
}
