import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ConsumerPicker } from "@/core/components/ConsumerPicker";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import {
  DEFAULT_HYDRATION_GOAL_ML,
  DEFAULT_REMINDER_END_HOUR,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  DEFAULT_REMINDER_START_HOUR,
  HydrationDailySummary,
  HydrationEntry,
  HydrationSettings,
  hydrationPercentage,
  hydrationRemainingMl,
  isValidWaterAmount
} from "@/domain/hydration";
import { Consumer } from "@/domain/meal";
import {
  addHydrationEntry,
  deleteHydrationEntry,
  getHydrationDailySummary,
  getHydrationSettings,
  listHydrationEntries,
  saveHydrationSettings,
  savePushSubscription
} from "@/services/hydrationRepository";
import { enableHydrationPushNotifications, startForegroundHydrationReminder } from "@/services/hydrationNotifications";
import { dateKey } from "@/services/nutrition";

const QUICK_AMOUNTS = [150, 250, 330, 500];

export function HydrationScreen() {
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [settings, setSettings] = useState<HydrationSettings | null>(null);
  const [summary, setSummary] = useState<HydrationDailySummary | null>(null);
  const [entries, setEntries] = useState<HydrationEntry[]>([]);
  const [customAmount, setCustomAmount] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [intervalDraft, setIntervalDraft] = useState("");
  const [startHourDraft, setStartHourDraft] = useState("");
  const [endHourDraft, setEndHourDraft] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!consumer) {
      setSettings(null);
      setSummary(null);
      setEntries([]);
      return;
    }
    try {
      const nextSettings = await getHydrationSettings(consumer);
      const [nextSummary, nextEntries] = await Promise.all([
        getHydrationDailySummary(dateKey(), consumer, nextSettings.dailyGoalMl),
        listHydrationEntries(dateKey(), consumer)
      ]);
      setSettings(nextSettings);
      setSummary(nextSummary);
      setEntries(nextEntries);
      setGoalDraft(String(nextSettings.dailyGoalMl));
      setIntervalDraft(String(nextSettings.reminderIntervalMinutes));
      setStartHourDraft(String(nextSettings.reminderStartHour));
      setEndHourDraft(String(nextSettings.reminderEndHour));
    } catch {
      setMessage("Nie udało się pobrać danych o nawodnieniu.");
    }
  }, [consumer]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    if (!settings || !summary) return;
    return startForegroundHydrationReminder(settings, summary.totalMl);
  }, [settings, summary]);

  const progress = useMemo(() => hydrationPercentage(summary?.totalMl ?? 0, settings?.dailyGoalMl ?? DEFAULT_HYDRATION_GOAL_ML), [settings?.dailyGoalMl, summary?.totalMl]);
  const remaining = useMemo(() => hydrationRemainingMl(summary?.totalMl ?? 0, settings?.dailyGoalMl ?? DEFAULT_HYDRATION_GOAL_ML), [settings?.dailyGoalMl, summary?.totalMl]);

  async function addWater(amountMl: number) {
    if (!consumer || !settings) return setMessage("Najpierw wybierz profil.");
    if (!isValidWaterAmount(amountMl)) return setMessage("Podaj ilość wody od 1 do 3000 ml.");
    try {
      setBusy(true);
      setMessage("");
      await addHydrationEntry(amountMl, consumer, settings.dailyGoalMl);
      setCustomAmount("");
      await load();
      setMessage(`Dodano ${Math.round(amountMl)} ml wody.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zapisać wody.");
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal() {
    if (!settings) return;
    const goal = parseNumber(goalDraft);
    if (!Number.isFinite(goal) || goal < 250 || goal > 10_000) return setMessage("Cel dzienny musi być liczbą od 250 do 10000 ml.");
    try {
      setBusy(true);
      const saved = await saveHydrationSettings({ ...settings, dailyGoalMl: goal });
      setSettings(saved);
      await load();
      setMessage("Zapisano cel dzienny.");
    } catch {
      setMessage("Nie udało się zapisać celu dziennego.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReminderSettings(enabled = settings?.remindersEnabled ?? false) {
    if (!settings) return;
    const interval = parseNumber(intervalDraft);
    const startHour = parseNumber(startHourDraft);
    const endHour = parseNumber(endHourDraft);
    if (!Number.isFinite(interval) || interval < 30 || interval > 720) return setMessage("Odstęp przypomnienia musi być od 30 do 720 minut.");
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || endHour <= startHour) {
      return setMessage("Podaj godziny od 0 do 24. Godzina końca musi być późniejsza.");
    }
    try {
      setBusy(true);
      const saved = await saveHydrationSettings({
        ...settings,
        remindersEnabled: enabled,
        reminderIntervalMinutes: interval,
        reminderStartHour: startHour,
        reminderEndHour: endHour
      });
      setSettings(saved);
      setMessage(enabled ? "Przypomnienia są aktywne." : "Przypomnienia są wyłączone.");
    } catch {
      setMessage("Nie udało się zapisać przypomnień.");
    } finally {
      setBusy(false);
    }
  }

  async function enablePush() {
    if (!settings) return setMessage("Najpierw wybierz profil.");
    setBusy(true);
    setMessage("");
    const result = await enableHydrationPushNotifications();
    if (result.status !== "enabled") {
      setBusy(false);
      setMessage(result.message);
      return;
    }
    try {
      await savePushSubscription(result.subscription);
      setMessage("Powiadomienia push zostały włączone na tym urządzeniu.");
    } catch {
      setMessage("Zgoda na powiadomienia jest aktywna, ale nie udało się zapisać urządzenia.");
    } finally {
      setBusy(false);
    }
  }

  async function undoEntry(entry: HydrationEntry) {
    try {
      setDeletingEntryId(entry.id);
      await deleteHydrationEntry(entry);
      await load();
      setMessage(`Cofnięto wpis ${entry.amountMl} ml.`);
    } catch {
      setMessage("Nie udało się cofnąć wpisu.");
    } finally {
      setDeletingEntryId(null);
    }
  }

  return <ModuleScreen title="Nawodnienie">
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.introCard}>
        <Text style={styles.pageTitle}>Woda i nawodnienie</Text>
        <Text style={styles.muted}>Zapisuj wypitą wodę osobno dla każdego profilu na tym koncie.</Text>
        <ConsumerPicker value={consumer} onChange={setConsumer} label="Czyje nawodnienie pokazujemy?" />
      </View>

      {!consumer ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Brak profilu nawodnienia</Text><Text style={styles.muted}>Dodaj osobę w zakładce Posiłki. Każdy profil będzie mieć własny licznik wody i cel dzienny.</Text></View> : <>
        <View style={styles.progressCard}>
          <View style={styles.progressHeading}><View><Text style={styles.sectionTitle}>Dzisiejszy bilans: {consumer.name}</Text><Text style={styles.muted}>{summary?.totalMl ?? 0} ml z {settings?.dailyGoalMl ?? DEFAULT_HYDRATION_GOAL_ML} ml</Text></View><Text style={styles.percent}>{progress}%</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.remaining}>{remaining > 0 ? `Do celu pozostało ${remaining} ml.` : "Cel nawodnienia został osiągnięty."}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dodaj wypitą wodę</Text>
          <View style={styles.quickRow}>{QUICK_AMOUNTS.map((amount) => <Pressable key={amount} disabled={busy} onPress={() => void addWater(amount)} style={[styles.quickButton, busy && styles.disabled]}><Text style={styles.quickButtonText}>+ {amount} ml</Text></Pressable>)}</View>
          <View style={styles.customRow}><TextInput value={customAmount} onChangeText={setCustomAmount} keyboardType="numeric" placeholder="Własna ilość, ml" style={styles.input} /><Pressable disabled={busy} onPress={() => void addWater(parseNumber(customAmount))} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.buttonText}>Dodaj</Text></Pressable></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cel dzienny</Text>
          <View style={styles.customRow}><TextInput value={goalDraft} onChangeText={setGoalDraft} keyboardType="numeric" placeholder="2000" style={styles.input} /><Text style={styles.unit}>ml</Text><Pressable disabled={busy} onPress={() => void saveGoal()} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.buttonText}>Zapisz cel</Text></Pressable></View>
        </View>

        <View style={styles.card}>
          <View style={styles.reminderHeading}><View><Text style={styles.sectionTitle}>Przypomnienia o wodzie</Text><Text style={styles.muted}>W godzinach aktywności i do osiągnięcia celu.</Text></View><Pressable disabled={busy} onPress={() => void saveReminderSettings(!(settings?.remindersEnabled ?? false))} style={[styles.toggle, settings?.remindersEnabled && styles.toggleActive, busy && styles.disabled]}><Text style={settings?.remindersEnabled ? styles.toggleActiveText : styles.toggleText}>{settings?.remindersEnabled ? "Włączone" : "Wyłączone"}</Text></Pressable></View>
          <View style={styles.reminderGrid}>
            <LabeledNumberInput label="Co ile minut" value={intervalDraft} onChange={setIntervalDraft} />
            <LabeledNumberInput label="Od godziny" value={startHourDraft} onChange={setStartHourDraft} />
            <LabeledNumberInput label="Do godziny" value={endHourDraft} onChange={setEndHourDraft} />
          </View>
          <Pressable disabled={busy} onPress={() => void saveReminderSettings(settings?.remindersEnabled ?? false)} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.buttonText}>Zapisz ustawienia przypomnień</Text></Pressable>
          <Pressable disabled={busy} onPress={() => void enablePush()} style={[styles.pushButton, busy && styles.disabled]}><Text style={styles.buttonText}>Włącz powiadomienia push na tym urządzeniu</Text></Pressable>
          <Text style={styles.note}>Na iPhonie lub iPadzie powiadomienia wymagają aplikacji zainstalowanej z ekranu początkowego.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Historia dzisiaj</Text>
          {entries.length ? entries.map((entry) => <View key={entry.id} style={styles.entry}><View><Text style={styles.entryAmount}>+ {entry.amountMl} ml</Text><Text style={styles.muted}>{formatTime(entry.createdAt)}</Text></View><Pressable disabled={deletingEntryId === entry.id} onPress={() => void undoEntry(entry)} style={[styles.undoButton, deletingEntryId === entry.id && styles.disabled]}><Text style={styles.undoText}>{deletingEntryId === entry.id ? "Cofanie..." : "Cofnij"}</Text></Pressable></View>) : <Text style={styles.muted}>Nie dodano jeszcze wody dzisiaj.</Text>}
        </View>
      </>}

      {!!message && <Text style={message.startsWith("Nie") || message.startsWith("Podaj") ? styles.error : styles.message}>{message}</Text>}
    </ScrollView>
  </ModuleScreen>;
}

function LabeledNumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="numeric" style={styles.fieldInput} /></View>;
}

function parseNumber(value: string) {
  return Number(value.trim().replace(",", "."));
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: 14, paddingBottom: 32 },
  introCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: "900", color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 14 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 8 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 18 },
  progressCard: { backgroundColor: "#E8F5E9", borderRadius: 18, padding: 18, gap: 12 },
  progressHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  percent: { color: colors.primary, fontSize: 28, fontWeight: "900" },
  progressTrack: { height: 16, backgroundColor: "#FFFFFF", borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: "#B7DAB9" },
  progressFill: { height: "100%", backgroundColor: "#00838F", borderRadius: 999 },
  remaining: { color: colors.primary, fontWeight: "800" },
  muted: { color: colors.muted, lineHeight: 20 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickButton: { minHeight: 48, backgroundColor: "#E0F2F1", borderRadius: 11, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "#80CBC4" },
  quickButtonText: { color: "#00695C", fontWeight: "900" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, minWidth: 120, backgroundColor: colors.background, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text },
  unit: { fontWeight: "900", color: colors.text },
  primaryButton: { minHeight: 48, backgroundColor: "#00838F", borderRadius: 11, justifyContent: "center", paddingHorizontal: 18 },
  secondaryButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 11, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  pushButton: { minHeight: 48, backgroundColor: "#1565C0", borderRadius: 11, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  buttonText: { color: "white", fontWeight: "900", textAlign: "center" },
  reminderHeading: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center" },
  reminderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { flexGrow: 1, minWidth: 115, gap: 5 },
  fieldLabel: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  fieldInput: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 16 },
  toggle: { minHeight: 42, borderRadius: 21, backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border },
  toggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { color: colors.text, fontWeight: "900" },
  toggleActiveText: { color: "white", fontWeight: "900" },
  note: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  entry: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  entryAmount: { color: colors.text, fontSize: 17, fontWeight: "900" },
  undoButton: { minHeight: 42, backgroundColor: "#FFEBEE", borderRadius: 10, justifyContent: "center", paddingHorizontal: 14 },
  undoText: { color: colors.danger, fontWeight: "900" },
  message: { backgroundColor: "#E8F5E9", color: colors.primary, fontWeight: "800", borderRadius: 10, padding: 13 },
  error: { backgroundColor: "#FFEBEE", color: colors.danger, fontWeight: "800", borderRadius: 10, padding: 13 },
  disabled: { opacity: 0.55 }
});
