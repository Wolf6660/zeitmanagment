import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApiClient } from "../services/api";
import type { ClockType, SessionUser, UiColors } from "../types/app";
import { colors } from "../theme/colors";
import { DateTimePickerField } from "../components/DateTimePickerField";

type Props = {
  api: ApiClient;
  user: SessionUser;
  uiColors: UiColors;
  onOpenPendingRequests?: () => void;
};

export function HomeScreen({ api, user, uiColors, onOpenPendingRequests }: Props) {
  const isLead = user.role === "SUPERVISOR" || user.role === "ADMIN";
  const [reasonText, setReasonText] = useState("");
  const [corrType, setCorrType] = useState<ClockType>("CLOCK_IN");
  const [corrAt, setCorrAt] = useState<Date>(new Date());
  const [corrNote, setCorrNote] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [selfCorrectionMaxDays, setSelfCorrectionMaxDays] = useState(3);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .publicConfig()
      .then((cfg) => setSelfCorrectionMaxDays(Number(cfg.selfCorrectionMaxDays ?? 3)))
      .catch(() => undefined);
    if (isLead) {
      api
        .pendingRequests()
        .then((rows) => setPendingCount(rows.length))
        .catch(() => undefined);
    }
  }, [api, isLead]);

  const pendingLabel = useMemo(() => {
    if (pendingCount > 0) return `Offene Antraege (${pendingCount})`;
    return "Keine Antraege";
  }, [pendingCount]);

  const submitClock = async (type: ClockType) => {
    setBusy(true);
    try {
      await api.clock(type, reasonText.trim());
      setStatus(`${type === "CLOCK_IN" ? "Kommen" : "Gehen"} erfolgreich gebucht.`);
      setReasonText("");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Start</Text>
      <Text style={styles.subtitle}>Hallo {user.name}</Text>

      <View style={styles.card}>
        <Text style={styles.section}>Kommen / Gehen</Text>
        <TextInput
          value={reasonText}
          onChangeText={setReasonText}
          placeholder="Grund / Kommentar"
          style={styles.input}
        />
        <View style={styles.row}>
          <Pressable style={[styles.button, { backgroundColor: uiColors.success }]} onPress={() => submitClock("CLOCK_IN")}>
            <Text style={styles.buttonText}>Kommen</Text>
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: uiColors.danger }]} onPress={() => submitClock("CLOCK_OUT")}>
            <Text style={styles.buttonText}>Gehen</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Pressable style={styles.collapseHeader} onPress={() => setShowCorrection((x) => !x)}>
          <Text style={styles.section}>Nachtrag</Text>
          <Text style={styles.collapseIcon}>{showCorrection ? "v" : ">"}</Text>
        </Pressable>
        {showCorrection && (
          <>
            <View style={styles.row}>
              <Pressable
                style={[styles.chip, corrType === "CLOCK_IN" && styles.chipActive]}
                onPress={() => setCorrType("CLOCK_IN")}
              >
                <Text style={styles.chipText}>Kommen</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, corrType === "CLOCK_OUT" && styles.chipActive]}
                onPress={() => setCorrType("CLOCK_OUT")}
              >
                <Text style={styles.chipText}>Gehen</Text>
              </Pressable>
            </View>
            <DateTimePickerField label="Datum" value={corrAt} mode="date" onChange={setCorrAt} />
            <DateTimePickerField label="Uhrzeit" value={corrAt} mode="time" onChange={setCorrAt} />
            <TextInput
              placeholder="Kommentar"
              value={corrNote}
              onChangeText={setCorrNote}
              style={styles.input}
            />
            <Pressable
              style={[styles.fullButton, { backgroundColor: uiColors.primary }, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={async () => {
                try {
                  setBusy(true);
                  const now = new Date();
                  if (corrAt.getTime() > now.getTime()) {
                    throw new Error("Kommen/Gehen in der Zukunft ist nicht erlaubt.");
                  }
                  const earliest = new Date(now.getTime());
                  earliest.setHours(0, 0, 0, 0);
                  earliest.setDate(earliest.getDate() - selfCorrectionMaxDays);
                  if (corrAt.getTime() < earliest.getTime()) {
                    throw new Error(`Nachtrag ist nur ${selfCorrectionMaxDays} Tage rueckwirkend erlaubt.`);
                  }
                  await api.selfCorrection(corrType, corrAt.toISOString(), corrNote);
                  setStatus("Nachtrag gespeichert.");
                  setCorrNote("");
                } catch (e) {
                  setStatus((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Nachtrag buchen</Text>}
            </Pressable>
          </>
        )}
      </View>

      {user.role === "AZUBI" && (
        <View style={styles.card}>
          <Text style={styles.section}>Berufsschule (Azubi)</Text>
          <Pressable
            style={[styles.fullButton, { backgroundColor: uiColors.primary }]}
            onPress={async () => {
              try {
                const today = new Date().toISOString().slice(0, 10);
                await api.azubiSchoolDay(today);
                setStatus("Berufsschultag wurde eingetragen.");
              } catch (e) {
                setStatus((e as Error).message);
              }
            }}
          >
            <Text style={styles.buttonText}>Heute als Berufsschule markieren</Text>
          </Pressable>
        </View>
      )}

      {isLead && (
        <View style={styles.card}>
          <Text style={styles.section}>Antragsuebersicht</Text>
          <Pressable style={[styles.fullButton, { backgroundColor: uiColors.primary }]} onPress={onOpenPendingRequests}>
            <Text style={styles.buttonText}>{pendingLabel}</Text>
          </Pressable>
        </View>
      )}

      {!!status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14, gap: 10 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.muted, marginBottom: 4 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8
  },
  section: { fontSize: 16, fontWeight: "700", color: colors.text },
  collapseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  collapseIcon: { color: colors.muted, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#fff"
  },
  row: { flexDirection: "row", gap: 8 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  fullButton: { borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 9,
    backgroundColor: "#fff"
  },
  chipActive: { backgroundColor: "#D1FAE5", borderColor: "#10B981" },
  chipText: { color: colors.text, fontWeight: "600" },
  status: { color: colors.text, fontWeight: "600" }
});
