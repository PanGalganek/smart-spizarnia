import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { createElement, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onCancel: () => void;
  onScanned: (barcode: string) => void;
};

export function BarcodeCamera({ onCancel, onScanned }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectorFrameRef = useRef<number | null>(null);
  const handledRef = useRef(false);
  const [status, setStatus] = useState("Uruchamianie tylnej kamery HD...");
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, productBarcodeFormats);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 60 });

    function finish(value: string) {
      const normalized = value.trim();
      if (!normalized || handledRef.current) return;
      handledRef.current = true;
      controlsRef.current?.stop();
      if (detectorFrameRef.current !== null) cancelAnimationFrame(detectorFrameRef.current);
      onScanned(normalized);
    }

    async function start() {
      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
        const ordered = orderCameras(devices);
        if (active) setCameras(ordered);
        const selected = ordered[cameraIndex];
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              ...(selected?.deviceId && selected.label ? { deviceId: { exact: selected.deviceId } } : { facingMode: { ideal: "environment" } }),
              width: { ideal: 2560 },
              height: { ideal: 1440 },
              frameRate: { ideal: 30 }
            }
          },
          videoRef.current ?? undefined,
          (result) => {
            if (result) finish(result.getText());
          }
        );
        if (!active) return controls.stop();
        controlsRef.current = controls;
        const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
        const capabilities = track?.getCapabilities() as ExtendedCapabilities | undefined;
        if (track && capabilities) await improveCameraTrack(track, capabilities);
        const refreshed = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
        if (active) setCameras(orderCameras(refreshed));
        setTorchAvailable(Boolean(capabilities && "torch" in capabilities));
        const settings = track?.getSettings();
        const resolution = settings?.width && settings?.height ? ` (${settings.width}x${settings.height})` : "";
        const nativeDetector = await startNativeDetector(videoRef.current, finish, () => active, detectorFrameRef);
        setStatus(`SKANOWANIE AKTYWNE${resolution}${nativeDetector ? " - podwójny odczyt" : ""}. Ustaw pionowe kreski kodu w ramce.`);
      } catch (error) {
        if (!active) return;
        const name = error instanceof Error ? error.name : "";
        setStatus(name === "NotAllowedError"
          ? "Brak dostępu do aparatu. Zezwól na aparat w ustawieniach Chrome."
          : "Nie udało się uruchomic tylnej kamery. Zamknij inne aplikacje korzystające z aparatu.");
      }
    }

    void start();
    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (detectorFrameRef.current !== null) cancelAnimationFrame(detectorFrameRef.current);
      detectorFrameRef.current = null;
    };
  }, [cameraIndex, onScanned]);

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch) return;
    const next = !torch;
    try {
      await controlsRef.current.switchTorch(next);
      setTorch(next);
    } catch {
      setStatus("Latarka nie jest obsługiwana przez ten aparat.");
    }
  }

  function switchCamera() {
    if (cameras.length < 2) return;
    controlsRef.current?.stop();
    controlsRef.current = null;
    handledRef.current = false;
    setTorch(false);
    setStatus("Zmiana aparatu...");
    setCameraIndex((current) => (current + 1) % cameras.length);
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
        {cameras.length > 1 && <Pressable onPress={switchCamera} style={styles.control}><Text style={styles.white}>Zmień aparat</Text></Pressable>}
        {torchAvailable && <Pressable onPress={() => void toggleTorch()} style={styles.control}><Text style={styles.white}>{torch ? "Wyłącz latarkę" : "Włącz latarkę"}</Text></Pressable>}
        <Pressable onPress={onCancel} style={styles.cancel}><Text style={styles.white}>Anuluj</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 420, borderRadius: 20, overflow: "hidden", backgroundColor: "#111" },
  video: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
  help: { position: "absolute", top: 24, color: "white", fontSize: 17, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, textAlign: "center" },
  target: { width: "72%", maxWidth: 620, height: 190, borderWidth: 4, borderColor: "white", borderRadius: 18, justifyContent: "center" },
  line: { height: 3, marginHorizontal: 18, backgroundColor: "#EF5350" },
  actions: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", gap: 12 },
  control: { backgroundColor: "#1565C0", padding: 14, borderRadius: 12 },
  cancel: { backgroundColor: "#C62828", padding: 14, borderRadius: 12 },
  white: { color: "white", fontWeight: "700" }
});

type ExtendedCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min: number; max: number };
  torch?: boolean;
  width?: { max: number };
  height?: { max: number };
};

const productBarcodeFormats = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR
];

type NativeBarcode = { rawValue: string };
type NativeBarcodeDetector = { detect: (source: HTMLVideoElement) => Promise<NativeBarcode[]> };
type NativeBarcodeDetectorConstructor = {
  new(options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

async function startNativeDetector(
  video: HTMLVideoElement | null,
  onDetected: (value: string) => void,
  isActive: () => boolean,
  frameRef: { current: number | null }
) {
  const Detector = (window as typeof window & { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector || !video) return false;
  try {
    const requested = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];
    const supported = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : requested;
    const formats = requested.filter((format) => supported.includes(format));
    const detector = new Detector(formats.length ? { formats } : undefined);
    let detecting = false;
    const scan = async () => {
      if (!isActive()) return;
      if (!detecting && video.readyState >= 2) {
        detecting = true;
        try {
          const results = await detector.detect(video);
          if (results[0]?.rawValue) return onDetected(results[0].rawValue);
        } catch { /* ZXing remains active as the fallback decoder. */ }
        finally { detecting = false; }
      }
      frameRef.current = requestAnimationFrame(scan);
    };
    frameRef.current = requestAnimationFrame(scan);
    return true;
  } catch {
    return false;
  }
}

async function improveCameraTrack(track: MediaStreamTrack, capabilities: ExtendedCapabilities) {
  const advanced: Record<string, unknown>[] = [];
  if (capabilities.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
  const constraints: MediaTrackConstraints = {
    width: capabilities.width?.max ? { ideal: Math.min(capabilities.width.max, 2560) } : { ideal: 1920 },
    height: capabilities.height?.max ? { ideal: Math.min(capabilities.height.max, 1440) } : { ideal: 1080 },
    ...(advanced.length ? { advanced: advanced as MediaTrackConstraintSet[] } : {})
  };
  try { await track.applyConstraints(constraints); } catch { /* Keep the best settings selected by Chrome. */ }
}

function orderCameras(devices: MediaDeviceInfo[]) {
  return [...devices].sort((left, right) => cameraScore(right.label) - cameraScore(left.label));
}

function cameraScore(label: string) {
  const value = label.toLowerCase();
  let score = 0;
  if (/back|rear|environment|tyl|camera2 0/.test(value)) score += 20;
  if (/front|user|przed/.test(value)) score -= 30;
  if (/ultra|wide|0\.5|macro|depth/.test(value)) score -= 15;
  if (/main|primary|standard|1x/.test(value)) score += 10;
  return score;
}
