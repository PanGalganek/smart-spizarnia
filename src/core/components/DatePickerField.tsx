import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";

type Props = { value: string; onChange: (value: string) => void; label?: string };
const weekdays = ["Pn", "Wt", "Sr", "Cz", "Pt", "So", "Nd"];

export function DatePickerField({ value, onChange, label = "Data waznosci (opcjonalna)" }: Props) {
  const selected = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selected ?? new Date());
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);

  function show() {
    setVisibleMonth(selected ?? new Date());
    setOpen(true);
  }

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <Pressable onPress={show} style={styles.input}><Text style={value ? styles.value : styles.placeholder}>{value ? formatPolishDate(value) : "Wybierz date z kalendarza"}</Text></Pressable>
      {!!value && <Pressable onPress={() => onChange("")} style={styles.clear}><Text style={styles.clearText}>Wyczysc</Text></Pressable>}
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><View style={styles.calendar}>
        <View style={styles.monthHeader}>
          <Pressable onPress={() => setVisibleMonth(changeMonth(visibleMonth, -1))} style={styles.nav}><Text style={styles.navText}>{"<"}</Text></Pressable>
          <Text style={styles.month}>{visibleMonth.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}</Text>
          <Pressable onPress={() => setVisibleMonth(changeMonth(visibleMonth, 1))} style={styles.nav}><Text style={styles.navText}>{">"}</Text></Pressable>
        </View>
        <View style={styles.week}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
        <View style={styles.days}>{days.map((day, index) => day ? <Pressable key={toIsoDate(day)} onPress={() => { onChange(toIsoDate(day)); setOpen(false); }} style={[styles.day, value === toIsoDate(day) && styles.selectedDay]}><Text style={value === toIsoDate(day) ? styles.selectedText : undefined}>{day.getDate()}</Text></Pressable> : <View key={`empty-${index}`} style={styles.day} />)}</View>
        <Pressable onPress={() => setOpen(false)} style={styles.close}><Text>Zamknij</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

export function formatPolishDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function changeMonth(date: Date, offset: number) { return new Date(date.getFullYear(), date.getMonth() + offset, 1); }

function calendarDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => new Date(date.getFullYear(), date.getMonth(), index + 1))];
}

const styles = StyleSheet.create({
  field: { minWidth: 210, flex: 1, gap: 6 }, label: { fontWeight: "600" }, inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12 }, value: { color: colors.text }, placeholder: { color: colors.muted },
  clear: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" }, clearText: { color: colors.danger, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 }, calendar: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
  monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, month: { fontSize: 19, fontWeight: "800", textTransform: "capitalize" }, nav: { padding: 10 }, navText: { fontSize: 30, color: colors.primary },
  week: { flexDirection: "row", marginTop: 8 }, weekday: { width: "14.285%", textAlign: "center", color: colors.muted, fontWeight: "700" }, days: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  day: { width: "14.285%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 22 }, selectedDay: { backgroundColor: colors.primary }, selectedText: { color: "white", fontWeight: "800" }, close: { alignSelf: "flex-end", backgroundColor: colors.background, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, marginTop: 12 }
});
