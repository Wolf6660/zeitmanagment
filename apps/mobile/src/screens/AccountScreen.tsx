import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import type { SessionUser, UiColors } from "../types/app";
import { colors } from "../theme/colors";

type Props = {
  user: SessionUser;
  uiColors: UiColors;
  onLogout: () => Promise<void>;
  onResetApp: () => Promise<void>;
};

export function AccountScreen({ user, uiColors, onLogout, onResetApp }: Props) {
  const isAdmin = user.role === "ADMIN";
  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const appBuild = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "?";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Konto</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.meta}>{user.loginName} - {user.role}</Text>
      </View>

      {isAdmin && (
        <View style={styles.card}>
          <Text style={styles.adminTitle}>Adminbereich</Text>
          <Text style={styles.adminHint}>Admin-Einstellungen werden ueber die Weboberflaeche verwaltet.</Text>
        </View>
      )}

      <Pressable style={[styles.button, { backgroundColor: uiColors.primary }]} onPress={() => void onLogout()}>
        <Text style={styles.buttonText}>Abmelden</Text>
      </Pressable>

      <Pressable
        style={[styles.button, { backgroundColor: uiColors.danger }]}
        onPress={() => {
          Alert.alert(
            "App zuruecksetzen",
            "Dadurch werden alle gespeicherten Daten geloescht und ein neuer QR-Scan erforderlich.",
            [
              { text: "Abbrechen", style: "cancel" },
              {
                text: "Zuruecksetzen",
                style: "destructive",
                onPress: () => {
                  void onResetApp();
                }
              }
            ]
          );
        }}
      >
        <Text style={styles.buttonText}>Komplett zuruecksetzen</Text>
      </Pressable>

      <Text style={styles.hint}>
        Aus Sicherheitsgruenden sind die Einrichtungsdaten nicht einsehbar und nicht aenderbar.
      </Text>
      <Text style={styles.version}>Version {appVersion} (Build {String(appBuild)}) - Beta</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14, gap: 10 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  meta: { color: colors.muted },
  adminTitle: { color: colors.text, fontWeight: "700", marginBottom: 6 },
  adminHint: { color: colors.muted, marginTop: 6, fontSize: 12 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  hint: { color: colors.muted },
  version: { color: colors.muted, fontSize: 12, marginTop: 8 }
});
