import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { useAppNavigation, useNavigationLayer } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";
import { accountStatusLabel, UserProfile } from "@/domain/userProfile";
import { deleteUserProfileAndData, getUserProfilePreview, listUserProfiles, setUserStatus, UserProfilePreview } from "@/services/adminRepository";
import { productType } from "@/services/productTypes";

export function AdminScreen() {
  const { isAdmin, profile } = useAuth();
  const appNavigation = useAppNavigation();
  const profileLayer = useNavigationLayer("admin-user-profile", "modal", { modal: "admin-user-profile", mode: "admin-details" });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [preview, setPreview] = useState<UserProfilePreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = profileLayer.open ? users.find((user) => user.uid === appNavigation.state.selectedId) ?? null : null;
  const confirmDelete = profileLayer.open && appNavigation.state.mode === "admin-delete";

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsers(await listUserProfiles());
      setMessage("");
    } catch {
      setMessage("Nie udało się pobrać listy użytkowników.");
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function openProfile(user: UserProfile) {
    setPreview(null);
    profileLayer.openLayer({ modal: "admin-user-profile", mode: "admin-details", selectedId: user.uid });
    try { setPreview(await getUserProfilePreview(user.uid)); }
    catch { setMessage("Nie udało się pobrać profilu użytkownika."); }
  }

  function openDeleteProfile(user: UserProfile) {
    setPreview(null);
    profileLayer.openLayer({ modal: "admin-user-profile", mode: "admin-delete", selectedId: user.uid });
  }

  async function changeStatus(user: UserProfile, status: "active" | "blocked") {
    try {
      setBusy(true);
      const updated = await setUserStatus(user, status);
      setUsers((current) => current.map((item) => item.uid === updated.uid ? updated : item));
      setMessage(status === "active" ? "Konto zatwierdzone." : "Konto zablokowane.");
    } catch {
      setMessage("Nie udało się zmienić statusu konta.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile() {
    if (!selected || selected.uid === profile?.uid) return;
    try {
      setBusy(true);
      await deleteUserProfileAndData(selected.uid);
      setUsers((current) => current.filter((item) => item.uid !== selected.uid));
      profileLayer.closeLayer();
      setPreview(null);
      setMessage("Profil użytkownika i jego dane zostały usunięte.");
    } catch {
      setMessage("Nie udało się usunąć profilu użytkownika.");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return <ModuleScreen title="Panel administratora"><Text style={styles.error}>Brak uprawnień administratora.</Text></ModuleScreen>;
  }

  return <ModuleScreen title="Panel administratora">
    {!!message && <Text style={message.startsWith("Nie") ? styles.error : styles.message}>{message}</Text>}
    <FlatList
      data={users}
      keyExtractor={(item) => item.uid}
      contentContainerStyle={users.length ? styles.list : styles.emptyList}
      ListEmptyComponent={<Text style={styles.empty}>Brak profili użytkowników.</Text>}
      renderItem={({ item }) => <View style={styles.card}>
        <View style={styles.userHeader}>
          <View style={styles.userText}>
            <Text style={styles.userName}>{item.displayName || item.email || item.uid}</Text>
            <Text style={styles.meta}>{item.email}</Text>
            <Text style={styles.meta}>Utworzono: {formatDateTime(item.createdAt)}</Text>
          </View>
          <Text style={[styles.status, item.status === "pending" && styles.pending, item.status === "blocked" && styles.blocked]}>{accountStatusLabel(item.status)}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={() => void openProfile(item)} style={styles.secondary}><Text style={styles.secondaryText}>Podejrzyj profil</Text></Pressable>
          {item.status !== "active" && <Pressable disabled={busy} onPress={() => void changeStatus(item, "active")} style={styles.approve}><Text style={styles.white}>Zatwierdź konto</Text></Pressable>}
          {item.status !== "blocked" && <Pressable disabled={busy || item.uid === profile?.uid} onPress={() => void changeStatus(item, "blocked")} style={[styles.blockButton, item.uid === profile?.uid && styles.disabled]}><Text style={styles.white}>Zablokuj</Text></Pressable>}
          <Pressable disabled={busy || item.uid === profile?.uid} onPress={() => openDeleteProfile(item)} style={[styles.deleteSmall, item.uid === profile?.uid && styles.disabled]}><Text style={styles.white}>Usuń</Text></Pressable>
        </View>
      </View>}
    />

    <Modal visible={profileLayer.open && !!selected} transparent animationType="fade" onRequestClose={profileLayer.closeLayer}>
      <View style={styles.backdrop}><View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={styles.userText}>
            <Text style={styles.modalTitle}>{selected?.displayName || selected?.email}</Text>
            <Text style={styles.meta}>{selected?.email}</Text>
          </View>
          <Pressable onPress={profileLayer.closeLayer}><Text style={styles.close}>Zamknij</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.preview}>
          <PreviewSection title="Produkty spożywcze" items={preview?.products.filter((item) => productType(item) === "food").map((item) => item.name) ?? []} />
          <PreviewSection title="Produkty chemiczne" items={preview?.products.filter((item) => productType(item) === "household_chemical").map((item) => item.name) ?? []} />
          <PreviewSection title="Spiżarnia" items={preview?.pantry.map((item) => `${item.product.name}: ${item.quantity} ${item.unit}`) ?? []} />
          <PreviewSection title="Koszyk" items={preview?.shoppingList.map((item) => `${item.name} - ${item.status}`) ?? []} />
          <PreviewSection title="Historia posiłków" items={preview?.meals.map((item) => `${item.name} (${item.dateKey})`) ?? []} />
          <View style={styles.detailBox}>
            <Text style={styles.detailTitle}>Lokalizacje i ustawienia</Text>
            {preview?.settings.length ? preview.settings.map((item) => <Text key={item.id} style={styles.meta}>{item.id}: {(item.values ?? []).join(", ") || "brak"}</Text>) : <Text style={styles.meta}>Brak ustawień.</Text>}
          </View>
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Usuwanie profilu</Text>
            <Text style={styles.meta}>Usunięcie profilu usuwa dane użytkownika: produkty, lokalizacje, koszyk, zapisane produkty i ustawienia.</Text>
            {confirmDelete && <Text style={styles.error}>Czy na pewno chcesz usunąć tego użytkownika i wszystkie jego dane?</Text>}
            {confirmDelete ? <View style={styles.actions}>
              <Pressable disabled={busy || selected?.uid === profile?.uid} onPress={() => void removeProfile()} style={[styles.deleteButton, selected?.uid === profile?.uid && styles.disabled]}><Text style={styles.white}>Tak, usuń użytkownika i dane</Text></Pressable>
              <Pressable onPress={() => appNavigation.updateState({ mode: "admin-details" })} style={styles.secondary}><Text style={styles.secondaryText}>Anuluj</Text></Pressable>
            </View> : <Pressable disabled={selected?.uid === profile?.uid} onPress={() => appNavigation.updateState({ mode: "admin-delete" }, { push: true })} style={[styles.deleteOutline, selected?.uid === profile?.uid && styles.disabled]}><Text style={styles.deleteText}>Usuń profil użytkownika</Text></Pressable>}
          </View>
        </ScrollView>
      </View></View>
    </Modal>
  </ModuleScreen>;
}

function PreviewSection({ title, items }: { title: string; items: string[] }) {
  return <View style={styles.detailBox}>
    <Text style={styles.detailTitle}>{title}</Text>
    <Text style={styles.detailValue}>{items.length}</Text>
    {items.length ? items.slice(0, 12).map((item, index) => <Text key={`${title}-${index}`} style={styles.meta}>- {item}</Text>) : <Text style={styles.meta}>Brak danych.</Text>}
    {items.length > 12 && <Text style={styles.meta}>... i jeszcze {items.length - 12}</Text>}
  </View>;
}

function formatDateTime(value: number) {
  if (!value) return "brak danych";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const styles = StyleSheet.create({
  list: { paddingBottom: 30, gap: 10 },
  emptyList: { flexGrow: 1 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 60 },
  message: { color: colors.primary, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" },
  error: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 },
  userHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  userText: { flex: 1, gap: 3 },
  userName: { fontSize: 19, fontWeight: "900" },
  meta: { color: colors.muted, lineHeight: 20 },
  status: { color: colors.primary, backgroundColor: "#E8F5E9", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, fontWeight: "900" },
  pending: { color: "#8A4B00", backgroundColor: "#FFF3E0" },
  blocked: { color: colors.danger, backgroundColor: "#FFEBEE" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondary: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 },
  secondaryText: { color: colors.primary, fontWeight: "800" },
  approve: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 },
  blockButton: { backgroundColor: "#6A1B9A", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 },
  deleteSmall: { backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 },
  white: { color: "white", fontWeight: "900" },
  disabled: { opacity: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 640, maxHeight: "92%", backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  modalTitle: { fontSize: 24, fontWeight: "900" },
  close: { color: colors.muted, fontWeight: "800", padding: 6 },
  preview: { gap: 10, paddingTop: 16, paddingBottom: 6 },
  detailBox: { backgroundColor: colors.background, borderRadius: 12, padding: 13, gap: 4 },
  detailTitle: { color: colors.muted, fontWeight: "900", textTransform: "uppercase", fontSize: 12 },
  detailValue: { fontSize: 22, color: colors.primary, fontWeight: "900" },
  dangerZone: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 8, gap: 10 },
  dangerTitle: { color: colors.danger, fontSize: 18, fontWeight: "900" },
  deleteOutline: { alignSelf: "flex-start", borderWidth: 2, borderColor: colors.danger, borderRadius: 10, padding: 12 },
  deleteButton: { backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 },
  deleteText: { color: colors.danger, fontWeight: "900" }
});
