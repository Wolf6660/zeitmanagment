import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  onSubmit: (loginName: string, password: string) => Promise<void>;
  onResetApp: () => Promise<void>;
  initialLoginName?: string;
  infoText?: string;
};

export function LoginScreen({ onSubmit, onResetApp, initialLoginName = "", infoText }: Props) {
  const [loginName, setLoginName] = useState(initialLoginName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Anmelden</Text>
      {!!infoText && <Text style={styles.info}>{infoText}</Text>}

      <Text style={styles.label}>Loginname</Text>
      <TextInput
        value={loginName}
        onChangeText={setLoginName}
        autoCapitalize="none"
        style={styles.input}
        placeholder="z. B. max"
      />

      <Text style={styles.label}>Passwort</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        placeholder="********"
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, busy && { opacity: 0.6 }]}
        disabled={busy}
        onPress={async () => {
          try {
            setBusy(true);
            setError(null);
            await onSubmit(loginName.trim(), password);
          } catch (e) {
            setError((e as Error).message || "Login fehlgeschlagen.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Einloggen</Text>}
      </Pressable>

      <Pressable
        style={styles.resetButton}
        onPress={() => {
          void onResetApp();
        }}
      >
        <Text style={styles.resetText}>App zuruecksetzen und QR neu scannen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 8 },
  title: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 12 },
  info: { color: colors.muted, marginBottom: 12 },
  label: { marginTop: 10, fontWeight: "600", color: colors.text },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  button: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, marginTop: 8 },
  resetButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.card
  },
  resetText: { color: colors.text, fontWeight: "600" }
});
