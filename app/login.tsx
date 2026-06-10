import { useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { colors } from "@/core/theme";

export default function LoginScreen() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Redirect href="/home" />;

  async function submit() {
    try {
      setBusy(true);
      setError("");
      await signIn(email.trim(), password);
      router.replace("/home");
    } catch {
      setError("Nieprawidlowy login lub haslo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Smart Spizarnia</Text>
        <Text style={styles.subtitle}>Panel domowej spizarni</Text>
        <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" style={styles.input} value={email} onChangeText={setEmail} />
        <TextInput secureTextEntry placeholder="Haslo" style={styles.input} value={password} onChangeText={setPassword} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable disabled={busy || !email || !password} onPress={submit} style={styles.button}>
          <Text style={styles.buttonText}>{busy ? "Logowanie..." : "Zaloguj"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  card: { width: 420, backgroundColor: colors.surface, padding: 32, borderRadius: 24, gap: 14, elevation: 4 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.muted, marginBottom: 10 },
  input: { backgroundColor: colors.background, borderRadius: 12, padding: 16, fontSize: 16 },
  error: { color: colors.danger },
  button: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 17 }
});
