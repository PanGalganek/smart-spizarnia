import { HydrationSettings, PushSubscriptionRecord } from "@/domain/hydration";

const BASE_PATH = process.env.EXPO_PUBLIC_APP_BASE_PATH ?? "/smart-spizarnia";

export type PushSetupResult =
  | { status: "enabled"; subscription: PushSubscriptionRecord }
  | { status: "unsupported" | "denied" | "missing_vapid" | "error"; message: string };

export async function enableHydrationPushNotifications(): Promise<PushSetupResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { status: "unsupported", message: "Ta przeglądarka nie obsługuje powiadomień push." };
  }

  const vapidKey = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    return { status: "missing_vapid", message: "Powiadomienia są przygotowane, ale klucz serwera nie został jeszcze skonfigurowany." };
  }

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied", message: "Nie przyznano zgody na powiadomienia." };

  try {
    const registration = await navigator.serviceWorker.register(`${BASE_PATH}/hydration-sw.js`, { scope: `${BASE_PATH}/` });
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys.auth) throw new Error("Brak kluczy subskrypcji urządzenia.");
    const now = Date.now();
    return {
      status: "enabled",
      subscription: {
        id: deviceSubscriptionId(),
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        enabled: true,
        userAgent: navigator.userAgent,
        createdAt: now,
        updatedAt: now
      }
    };
  } catch {
    return { status: "error", message: "Nie udało się włączyć powiadomień na tym urządzeniu." };
  }
}

export function startForegroundHydrationReminder(settings: HydrationSettings, totalMl: number) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted" || !settings.remindersEnabled || totalMl >= settings.dailyGoalMl) return () => undefined;
  const interval = Math.max(30, settings.reminderIntervalMinutes) * 60_000;
  const timer = window.setInterval(() => {
    const hour = new Date().getHours();
    if (hour < settings.reminderStartHour || hour >= settings.reminderEndHour) return;
    void showForegroundNotification(settings.consumerName);
  }, interval);
  return () => window.clearInterval(timer);
}

async function showForegroundNotification(consumerName: string) {
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Smart Spiżarnia - nawodnienie", {
      body: `${consumerName}, pamiętaj o szklance wody.`,
      icon: `${BASE_PATH}/icon-192.png`,
      badge: `${BASE_PATH}/icon-192.png`,
      data: { url: `${BASE_PATH}/hydration` }
    });
  } catch {
    // The scheduled server push remains the reliable reminder when the app is closed.
  }
}

function deviceSubscriptionId() {
  const key = "smart-spizarnia-push-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const random = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const id = `web-${random}`;
  window.localStorage.setItem(key, id);
  return id;
}

function urlBase64ToUint8Array(value: string) {
  const base64 = value.padEnd(value.length + (4 - value.length % 4) % 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
