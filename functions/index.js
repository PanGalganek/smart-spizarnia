"use strict";

const admin = require("firebase-admin");
const webpush = require("web-push");
const { defineSecret, defineString } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");

admin.initializeApp();

const WEB_PUSH_VAPID_PUBLIC_KEY = defineString("WEB_PUSH_VAPID_PUBLIC_KEY");
const WEB_PUSH_VAPID_SUBJECT = defineString("WEB_PUSH_VAPID_SUBJECT");
const WEB_PUSH_VAPID_PRIVATE_KEY = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
const TIME_ZONE = "Europe/Warsaw";

exports.sendHydrationReminders = onSchedule({
  schedule: "every 15 minutes",
  timeZone: TIME_ZONE,
  secrets: [WEB_PUSH_VAPID_PRIVATE_KEY]
}, async () => {
  const publicKey = WEB_PUSH_VAPID_PUBLIC_KEY.value();
  const privateKey = WEB_PUSH_VAPID_PRIVATE_KEY.value();
  const subject = WEB_PUSH_VAPID_SUBJECT.value();
  if (!publicKey || !privateKey || !subject) {
    logger.error("Brak konfiguracji kluczy Web Push.");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const db = admin.firestore();
  const now = Date.now();
  const localTime = getLocalTime(new Date(now));
  const settingsSnapshot = await db.collectionGroup("hydrationSettings")
    .where("remindersEnabled", "==", true)
    .get();

  await Promise.all(settingsSnapshot.docs.map((settingsDoc) => sendReminderIfNeeded({
    db,
    settingsDoc,
    now,
    localTime
  })));
});

async function sendReminderIfNeeded({ db, settingsDoc, now, localTime }) {
  const settings = settingsDoc.data();
  if (!isWithinReminderWindow(settings, localTime.hour)) return;
  const intervalMs = Math.max(30, Number(settings.reminderIntervalMinutes) || 120) * 60_000;
  if (Number(settings.lastReminderAt) && now - Number(settings.lastReminderAt) < intervalMs) return;

  const userDoc = settingsDoc.ref.parent.parent;
  if (!userDoc) return;
  const userId = userDoc.id;
  const consumerId = settings.consumerId;
  if (!consumerId) return;

  const dailyId = `${consumerId}_${localTime.dateKey}`;
  const dailySnapshot = await db.doc(`users/${userId}/hydrationDaily/${dailyId}`).get();
  const totalMl = Number(dailySnapshot.data()?.totalMl ?? 0);
  const goalMl = Number(settings.dailyGoalMl ?? 2000);
  if (totalMl >= goalMl) return;

  const subscriptions = await db.collection(`users/${userId}/pushSubscriptions`)
    .where("enabled", "==", true)
    .get();
  if (subscriptions.empty) return;

  const payload = JSON.stringify({
    title: "Smart Spiżarnia - nawodnienie",
    body: `${settings.consumerName || "Pamiętaj"}, wypij szklankę wody.`,
    url: "/smart-spizarnia/hydration"
  });
  let delivered = false;

  await Promise.all(subscriptions.docs.map(async (subscriptionDoc) => {
    const subscription = subscriptionDoc.data();
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload);
      delivered = true;
    } catch (error) {
      const statusCode = Number(error?.statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await subscriptionDoc.ref.delete();
        return;
      }
      logger.warn("Nie udało się wysłać powiadomienia o nawodnieniu.", { userId, statusCode });
    }
  }));

  if (delivered) {
    await settingsDoc.ref.set({ lastReminderAt: now, updatedAt: now }, { merge: true });
  }
}

function isWithinReminderWindow(settings, hour) {
  const start = Math.max(0, Math.min(23, Number(settings.reminderStartHour ?? 8)));
  const end = Math.max(start + 1, Math.min(24, Number(settings.reminderEndHour ?? 21)));
  return hour >= start && hour < end;
}

function getLocalTime(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}
