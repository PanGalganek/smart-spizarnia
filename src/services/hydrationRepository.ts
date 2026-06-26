import { deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, where } from "firebase/firestore";
import { db } from "@/core/firebase";
import {
  DEFAULT_HYDRATION_GOAL_ML,
  DEFAULT_REMINDER_END_HOUR,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  DEFAULT_REMINDER_START_HOUR,
  HydrationDailySummary,
  HydrationEntry,
  HydrationSettings,
  PushSubscriptionRecord,
  hydrationDailyId,
  isValidWaterAmount,
  normalizeHydrationGoal
} from "@/domain/hydration";
import { Consumer } from "@/domain/meal";
import { dateKey } from "@/services/nutrition";
import { userCollection, userDoc } from "@/services/userData";

function defaultSettings(consumer: Consumer): HydrationSettings {
  return {
    id: consumer.id,
    consumerId: consumer.id,
    consumerName: consumer.name,
    dailyGoalMl: DEFAULT_HYDRATION_GOAL_ML,
    remindersEnabled: false,
    reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES,
    reminderStartHour: DEFAULT_REMINDER_START_HOUR,
    reminderEndHour: DEFAULT_REMINDER_END_HOUR,
    updatedAt: Date.now()
  };
}

export async function getHydrationSettings(consumer: Consumer): Promise<HydrationSettings> {
  const snapshot = await getDoc(userDoc("hydrationSettings", consumer.id));
  if (!snapshot.exists()) return defaultSettings(consumer);
  const saved = snapshot.data() as Partial<HydrationSettings>;
  return {
    ...defaultSettings(consumer),
    ...saved,
    id: consumer.id,
    consumerId: consumer.id,
    consumerName: consumer.name,
    dailyGoalMl: normalizeHydrationGoal(Number(saved.dailyGoalMl ?? DEFAULT_HYDRATION_GOAL_ML))
  };
}

export async function saveHydrationSettings(settings: HydrationSettings): Promise<HydrationSettings> {
  const interval = Math.max(30, Math.min(720, Math.round(settings.reminderIntervalMinutes)));
  const start = Math.max(0, Math.min(23, Math.round(settings.reminderStartHour)));
  const end = Math.max(start + 1, Math.min(24, Math.round(settings.reminderEndHour)));
  const updated: HydrationSettings = {
    ...settings,
    dailyGoalMl: normalizeHydrationGoal(settings.dailyGoalMl),
    reminderIntervalMinutes: interval,
    reminderStartHour: start,
    reminderEndHour: end,
    updatedAt: Date.now()
  };
  await setDoc(userDoc("hydrationSettings", updated.consumerId), updated, { merge: true });
  return updated;
}

export async function getHydrationDailySummary(day: string, consumer: Consumer, goalMl = DEFAULT_HYDRATION_GOAL_ML): Promise<HydrationDailySummary> {
  const id = hydrationDailyId(consumer.id, day);
  const snapshot = await getDoc(userDoc("hydrationDaily", id));
  if (!snapshot.exists()) {
    return { id, consumerId: consumer.id, consumerName: consumer.name, dateKey: day, totalMl: 0, goalMl: normalizeHydrationGoal(goalMl), entryCount: 0, updatedAt: Date.now() };
  }
  const saved = snapshot.data() as HydrationDailySummary;
  return { ...saved, id, consumerId: consumer.id, consumerName: consumer.name, dateKey: day, goalMl: normalizeHydrationGoal(saved.goalMl ?? goalMl) };
}

export async function listHydrationEntries(day: string, consumer: Consumer): Promise<HydrationEntry[]> {
  // A single profile produces only a small number of entries per day. Filtering
  // in the client avoids a required composite Firestore index on first launch.
  const snapshot = await getDocs(userCollection("hydrationEntries"));
  return snapshot.docs
    .map((item) => item.data() as HydrationEntry)
    .filter((item) => item.consumerId === consumer.id && item.dateKey === day)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function addHydrationEntry(amountMl: number, consumer: Consumer, goalMl: number, createdAt = Date.now()): Promise<HydrationEntry> {
  if (!isValidWaterAmount(amountMl)) throw new Error("Podaj ilość wody od 1 do 3000 ml.");
  const day = dateKey(createdAt);
  const dailyId = hydrationDailyId(consumer.id, day);
  const entryRef = doc(userCollection("hydrationEntries"));
  const dailyRef = userDoc("hydrationDaily", dailyId);
  const entry: HydrationEntry = {
    id: entryRef.id,
    consumerId: consumer.id,
    consumerName: consumer.name,
    amountMl: Math.round(amountMl),
    dateKey: day,
    createdAt
  };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(dailyRef);
    const current = snapshot.exists() ? snapshot.data() as HydrationDailySummary : null;
    const next: HydrationDailySummary = {
      id: dailyId,
      consumerId: consumer.id,
      consumerName: consumer.name,
      dateKey: day,
      totalMl: Math.max(0, Math.round((current?.totalMl ?? 0) + entry.amountMl)),
      goalMl: normalizeHydrationGoal(goalMl),
      entryCount: Math.max(0, (current?.entryCount ?? 0) + 1),
      updatedAt: Date.now()
    };
    transaction.set(entryRef, entry);
    transaction.set(dailyRef, next);
  });
  return entry;
}

export async function deleteHydrationEntry(entry: HydrationEntry): Promise<void> {
  const entryRef = userDoc("hydrationEntries", entry.id);
  const dailyRef = userDoc("hydrationDaily", hydrationDailyId(entry.consumerId, entry.dateKey));
  await runTransaction(db, async (transaction) => {
    const entrySnapshot = await transaction.get(entryRef);
    const dailySnapshot = await transaction.get(dailyRef);
    if (!entrySnapshot.exists()) return;
    const daily = dailySnapshot.exists() ? dailySnapshot.data() as HydrationDailySummary : null;
    const entryCount = Math.max(0, (daily?.entryCount ?? 1) - 1);
    transaction.delete(entryRef);
    if (entryCount === 0) {
      transaction.delete(dailyRef);
      return;
    }
    transaction.set(dailyRef, {
      ...daily,
      totalMl: Math.max(0, (daily?.totalMl ?? 0) - entry.amountMl),
      entryCount,
      updatedAt: Date.now()
    });
  });
}

export async function savePushSubscription(subscription: PushSubscriptionRecord) {
  await setDoc(userDoc("pushSubscriptions", subscription.id), subscription, { merge: true });
}

export async function removeHydrationConsumerData(consumerId: string) {
  const collections = ["hydrationSettings", "hydrationDaily", "hydrationEntries"] as const;
  await Promise.all(collections.map(async (collectionName) => {
    const snapshot = await getDocs(query(userCollection(collectionName), where("consumerId", "==", consumerId)));
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  }));
}
