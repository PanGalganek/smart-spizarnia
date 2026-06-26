export const DEFAULT_HYDRATION_GOAL_ML = 2000;
export const DEFAULT_REMINDER_INTERVAL_MINUTES = 120;
export const DEFAULT_REMINDER_START_HOUR = 8;
export const DEFAULT_REMINDER_END_HOUR = 21;

export type HydrationSettings = {
  id: string;
  consumerId: string;
  consumerName: string;
  dailyGoalMl: number;
  remindersEnabled: boolean;
  reminderIntervalMinutes: number;
  reminderStartHour: number;
  reminderEndHour: number;
  lastReminderAt?: number;
  updatedAt: number;
};

export type HydrationEntry = {
  id: string;
  consumerId: string;
  consumerName: string;
  amountMl: number;
  dateKey: string;
  createdAt: number;
};

export type HydrationDailySummary = {
  id: string;
  consumerId: string;
  consumerName: string;
  dateKey: string;
  totalMl: number;
  goalMl: number;
  entryCount: number;
  updatedAt: number;
};

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
  userAgent?: string;
  createdAt: number;
  updatedAt: number;
};

export function hydrationDailyId(consumerId: string, day: string) {
  return `${consumerId}_${day}`;
}

export function normalizeHydrationGoal(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_HYDRATION_GOAL_ML;
  return Math.max(250, Math.min(10_000, Math.round(value)));
}

export function hydrationPercentage(totalMl: number, goalMl: number) {
  if (!Number.isFinite(goalMl) || goalMl <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, totalMl) / goalMl) * 100));
}

export function hydrationRemainingMl(totalMl: number, goalMl: number) {
  return Math.max(0, normalizeHydrationGoal(goalMl) - Math.max(0, totalMl));
}

export function isValidWaterAmount(amountMl: number) {
  return Number.isFinite(amountMl) && amountMl > 0 && amountMl <= 3_000;
}
