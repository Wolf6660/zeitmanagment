import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { decodeProvisioningQr } from "../utils/crypto";
import type { ProvisioningPayload } from "../types/app";
import { colors } from "../theme/colors";

type Props = {
  onResolved: (payload: ProvisioningPayload) => Promise<void>;
};

export function BootstrapScanScreen({ onResolved }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [manualQr, setManualQr] = useState("");

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Kamera-Zugriff erforderlich</Text>
        <Text style={styles.text}>Bitte Kamera erlauben, um den Einrichtungs-QR-Code zu scannen.</Text>
        <Pressable onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Kamera erlauben</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>App einrichten</Text>
      <Text style={styles.text}>Scanne den verschluesselten QR-Code aus der Verwaltung.</Text>

      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanLocked || busy ? undefined : async ({ data }) => {
            try {
              setScanLocked(true);
              setBusy(true);
              setError(null);
              const payload = decodeProvisioningQr(data);
              await onResolved(payload);
            } catch (e) {
              setError((e as Error).message || "QR-Code konnte nicht verarbeitet werden.");
              setScanLocked(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {busy && <ActivityIndicator color={colors.primary} />}

      <View style={styles.manualWrap}>
        <Text style={styles.manualTitle}>Alternativ: QR-Inhalt einfuegen</Text>
        <TextInput
          value={manualQr}
          onChangeText={setManualQr}
          placeholder="ZMOBILE1:..."
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.manualInput}
        />
        <Pressable
          onPress={async () => {
            try {
              setBusy(true);
              setError(null);
              const payload = decodeProvisioningQr(manualQr);
              await onResolved(payload);
            } catch (e) {
              setError((e as Error).message || "QR-Code konnte nicht verarbeitet werden.");
            } finally {
              setBusy(false);
            }
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>QR-Inhalt uebernehmen</Text>
        </Pressable>
      </View>

      {!!error && (
        <Pressable onPress={() => setError(null)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Erneut scannen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 12 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  text: { color: colors.muted, fontSize: 15 },
  cameraWrap: {
    marginTop: 8,
    height: 360,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#000"
  },
  error: { color: colors.danger, fontWeight: "600" },
  manualWrap: { marginTop: 8, gap: 8 },
  manualTitle: { color: colors.text, fontWeight: "700" },
  manualInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start"
  },
  secondaryButtonText: { color: colors.text, fontWeight: "600" }
});
