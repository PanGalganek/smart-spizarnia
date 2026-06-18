import { useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { accountStatusLabel } from "@/domain/userProfile";
import { colors } from "@/core/theme";

export default function LoginScreen() {
  const { user, profile, isActive, signIn, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && isActive) return <Redirect href="/home" />;

  async function submit() {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      if (mode === "register") {
        const created = await register(email.trim(), password, displayName);
        setMessage(created.status === "pending" ? "Konto oczekuje na zatwierdzenie przez administratora." : "Konto zostało utworzone.");
        return;
      }
      await signIn(email.trim(), password);
      setMessage("Sprawdzanie statusu konta...");
    } catch {
      setError(mode === "register" ? "Nie udało się utworzyć konta. Sprawdź e-mail i hasło." : "Nieprawidłowy login lub hasło.");
    } finally {
      setBusy(false);
    }
  }

  const blockedMessage = profile?.status === "pending"
    ? "Konto oczekuje na zatwierdzenie przez administratora."
    : profile?.status === "blocked"
      ? "Konto jest zablokowane. Skontaktuj się z administratorem."
      : "";

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Smart Spiżarnia</Text>
        <Text style={styles.subtitle}>{mode === "login" ? "Panel domowej spiżarni" : "Utwórz konto użytkownika"}</Text>
        <View style={styles.switchRow}>
          <Pressable onPress={() => { setMode("login"); setError(""); setMessage(""); }} style={[styles.switchButton, mode === "login" && styles.switchActive]}><Text style={mode === "login" ? styles.switchActiveText : styles.switchText}>Logowanie</Text></Pressable>
          <Pressable onPress={() => { setMode("register"); setError(""); setMessage(""); }} style={[styles.switchButton, mode === "register" && styles.switchActive]}><Text style={mode === "register" ? styles.switchActiveText : styles.switchText}>Utwórz konto</Text></Pressable>
        </View>
        {mode === "register" && <TextInput placeholder="Nazwa profilu / imię (opcjonalnie)" style={styles.input} value={displayName} onChangeText={setDisplayName} />}
        <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" style={styles.input} value={email} onChangeText={setEmail} />
        <TextInput secureTextEntry placeholder="Hasło" style={styles.input} value={password} onChangeText={setPassword} />
        {!!blockedMessage && <Text style={profile?.status === "pending" ? styles.info : styles.error}>{blockedMessage}</Text>}
        {!!message && <Text style={styles.info}>{message}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!profile && !isActive && <Text style={styles.status}>Status konta: {accountStatusLabel(profile.status)}</Text>}
        <Pressable disabled={busy || !email || !password} onPress={submit} style={[styles.button, (busy || !email || !password) && styles.disabled]}>
          <Text style={styles.buttonText}>{busy ? "Przetwarzanie..." : mode === "login" ? "Zaloguj" : "Utwórz konto"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 18 },
  card: { width: "100%", maxWidth: 440, backgroundColor: colors.surface, padding: 30, borderRadius: 24, gap: 14, elevation: 4 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.muted, marginBottom: 4 },
  switchRow: { flexDirection: "row", gap: 8 },
  switchButton: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: "center" },
  switchActive: { backgroundColor: colors.primary },
  switchText: { color: colors.text, fontWeight: "800" },
  switchActiveText: { color: "white", fontWeight: "900" },
  input: { backgroundColor: colors.background, borderRadius: 12, padding: 16, fontSize: 16 },
  error: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 10, fontWeight: "700" },
  info: { color: colors.primary, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 10, fontWeight: "700" },
  status: { color: colors.muted, fontWeight: "700" },
  button: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center" },
  disabled: { opacity: 0.5 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 17 }
});
