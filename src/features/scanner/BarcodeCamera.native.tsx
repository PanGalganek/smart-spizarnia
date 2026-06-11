import { BarcodeScanningResult, CameraView } from "expo-camera";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onCancel: () => void;
  onScanned: (barcode: string) => void;
};

const barcodeTypes = [
  "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14", "codabar"
] as const;

export function BarcodeCamera({ onCancel, onScanned }: Props) {
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);

  function handleScan(result: BarcodeScanningResult) {
    if (result.data.trim()) onScanned(result.data.trim());
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        autofocus="off"
        zoom={0}
        ratio="4:3"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
        onCameraReady={() => setReady(true)}
        onMountError={() => setReady(false)}
        onBarcodeScanned={handleScan}
      />
      <View pointerEvents="none" style={styles.overlay}>
        <Text style={styles.help}>{ready ? "Trzymaj kod 15-25 cm od aparatu i poczekaj na ostrosc" : "Uruchamianie aparatu..."}</Text>
        <View style={styles.target}><View style={styles.line} /></View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => setTorch((value) => !value)} style={styles.control}>
          <Text style={styles.white}>{torch ? "Wylacz latarke" : "Wlacz latarke"}</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.cancel}><Text style={styles.white}>Anuluj</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 420, borderRadius: 20, overflow: "hidden", backgroundColor: "#111" },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
  help: { position: "absolute", top: 24, color: "white", fontSize: 17, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  target: { width: "72%", maxWidth: 620, height: 190, borderWidth: 4, borderColor: "white", borderRadius: 18, justifyContent: "center" },
  line: { height: 3, marginHorizontal: 18, backgroundColor: "#EF5350" },
  actions: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", gap: 12 },
  control: { backgroundColor: "#1565C0", padding: 14, borderRadius: 12 },
  cancel: { backgroundColor: "#C62828", padding: 14, borderRadius: 12 },
  white: { color: "white", fontWeight: "700" }
});
