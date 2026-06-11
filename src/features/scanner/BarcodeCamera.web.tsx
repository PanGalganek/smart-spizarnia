import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { createElement, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onCancel: () => void;
  onScanned: (barcode: string) => void;
};

export function BarcodeCamera({ onCancel, onScanned }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [status, setStatus] = useState("Uruchamianie tylnej kamery HD...");
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });

    async function start() {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 }
            }
          },
          videoRef.current ?? undefined,
          (result) => {
            const value = result?.getText().trim();
            if (!value || handledRef.current) return;
            handledRef.current = true;
            controlsRef.current?.stop();
            onScanned(value);
          }
        );
        if (!active) return controls.stop();
        controlsRef.current = controls;
        const capabilities = controls.streamVideoCapabilitiesGet?.((track) => [track]);
        setTorchAvailable(Boolean(capabilities && "torch" in capabilities));
        setStatus("Umiesc caly kod w ramce. Kod powinien zajmowac wiekszosc pola.");
      } catch (error) {
        if (!active) return;
        const name = error instanceof Error ? error.name : "";
        setStatus(name === "NotAllowedError"
          ? "Brak dostepu do aparatu. Zezwol na aparat w ustawieniach Chrome."
          : "Nie udalo sie uruchomic tylnej kamery. Zamknij inne aplikacje korzystajace z aparatu.");
      }
    }

    void start();
    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onScanned]);

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch) return;
    const next = !torch;
    try {
      await controlsRef.current.switchTorch(next);
      setTorch(next);
    } catch {
      setStatus("Latarka nie jest obslugiwana przez ten aparat.");
    }
  }

  return (
    <View style={styles.container}>
      {createElement("video", {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: styles.video as object
      })}
      <View pointerEvents="none" style={styles.overlay}>
        <Text style={styles.help}>{status}</Text>
        <View style={styles.target}><View style={styles.line} /></View>
      </View>
      <View style={styles.actions}>
        {torchAvailable && <Pressable onPress={() => void toggleTorch()} style={styles.control}><Text style={styles.white}>{torch ? "Wylacz latarke" : "Wlacz latarke"}</Text></Pressable>}
        <Pressable onPress={onCancel} style={styles.cancel}><Text style={styles.white}>Anuluj</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 420, borderRadius: 20, overflow: "hidden", backgroundColor: "#111" },
  video: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
  help: { position: "absolute", top: 24, color: "white", fontSize: 17, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, textAlign: "center" },
  target: { width: "72%", maxWidth: 620, height: 190, borderWidth: 4, borderColor: "white", borderRadius: 18, justifyContent: "center" },
  line: { height: 3, marginHorizontal: 18, backgroundColor: "#EF5350" },
  actions: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", gap: 12 },
  control: { backgroundColor: "#1565C0", padding: 14, borderRadius: 12 },
  cancel: { backgroundColor: "#C62828", padding: 14, borderRadius: 12 },
  white: { color: "white", fontWeight: "700" }
});
