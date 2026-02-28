import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApiClient } from "../services/api";
import type { UiColors } from "../types/app";
import { colors } from "../theme/colors";

type LeavePending = {
  id: string;
  status: string;
  user: { name: string };
  kind: string;
  startDate: string;
  endDate: string;
};

type BreakPending = {
  id: string;
  date: string;
  minutes: number;
  reason: string;
  user: { id: string; name: string; loginName: string };
};

type Props = {
  api: ApiClient;
  uiColors: UiColors;
};

export function TeamScreen({ api, uiColors }: Props) {
  const [today, setToday] = useState<Array<{ id: string; userName: string; type: string; occurredAt: string }>>([]);
  const [pendingLeave, setPendingLeave] = useState<LeavePending[]>([]);
  const [pendingBreak, setPendingBreak] = useState<BreakPending[]>([]);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([api.todayOverview(), api.pendingRequests(), api.pendingBreakCreditRequests()]);
      setToday(a);
      setPendingLeave(b);
      setPendingBreak(c);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [api]);

  const noteFor = (id: string) => decisionNotes[id] ?? "";

  const ensureNote = (id: string): string => {
    const note = noteFor(id).trim();
    if (!note) throw new Error("Notiz ist Pflicht.");
    return note;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Team</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!status && <Text style={styles.status}>{status}</Text>}

      <Text style={styles.section}>Heute</Text>
      <FlatList
        data={today}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 6 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.main}>{item.userName}</Text>
            <Text style={styles.sub}>{item.type} - {new Date(item.occurredAt).toLocaleTimeString("de-DE")}</Text>
          </View>
        )}
      />

      <Text style={styles.section}>Offene Urlaubs-/Ueberstundenantraege</Text>
      <FlatList
        data={pendingLeave}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.main}>{item.user.name}</Text>
            <Text style={styles.sub}>{item.kind} - {item.startDate.slice(0, 10)} bis {item.endDate.slice(0, 10)}</Text>
            <TextInput
              value={noteFor(item.id)}
              onChangeText={(v) => setDecisionNotes((prev) => ({ ...prev, [item.id]: v }))}
              placeholder="Notiz (Pflicht)"
              style={styles.input}
            />
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.button, { backgroundColor: uiColors.success }]}
                onPress={async () => {
                  try {
                    const note = ensureNote(item.id);
                    await api.leaveDecision(item.id, "APPROVED", note);
                    setStatus("Antrag genehmigt.");
                    await load();
                  } catch (e) {
                    setStatus((e as Error).message);
                  }
                }}
              >
                <Text style={styles.buttonText}>Genehmigen</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: uiColors.danger }]}
                onPress={async () => {
                  try {
                    const note = ensureNote(item.id);
                    await api.leaveDecision(item.id, "REJECTED", note);
                    setStatus("Antrag abgelehnt.");
                    await load();
                  } catch (e) {
                    setStatus((e as Error).message);
                  }
                }}
              >
                <Text style={styles.buttonText}>Ablehnen</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Text style={styles.section}>Offene Pausengutschriften</Text>
      <FlatList
        data={pendingBreak}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.main}>{item.user.name}</Text>
            <Text style={styles.sub}>{item.date.slice(0, 10)} - {item.minutes} Minuten</Text>
            <Text style={styles.sub}>Grund: {item.reason}</Text>
            <TextInput
              value={noteFor(item.id)}
              onChangeText={(v) => setDecisionNotes((prev) => ({ ...prev, [item.id]: v }))}
              placeholder="Notiz (Pflicht)"
              style={styles.input}
            />
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.button, { backgroundColor: uiColors.success }]}
                onPress={async () => {
                  try {
                    const note = ensureNote(item.id);
                    await api.breakCreditDecision(item.id, "APPROVED", note);
                    setStatus("Pausengutschrift genehmigt.");
                    await load();
                  } catch (e) {
                    setStatus((e as Error).message);
                  }
                }}
              >
                <Text style={styles.buttonText}>Genehmigen</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: uiColors.danger }]}
                onPress={async () => {
                  try {
                    const note = ensureNote(item.id);
                    await api.breakCreditDecision(item.id, "REJECTED", note);
                    setStatus("Pausengutschrift abgelehnt.");
                    await load();
                  } catch (e) {
                    setStatus((e as Error).message);
                  }
                }}
              >
                <Text style={styles.buttonText}>Ablehnen</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14, gap: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  section: { marginTop: 8, fontWeight: "700", color: colors.text },
  row: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 6 },
  main: { color: colors.text, fontWeight: "700" },
  sub: { color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" },
  actionRow: { flexDirection: "row", gap: 8 },
  button: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10 },
  buttonText: { color: "#fff", fontWeight: "700" },
  error: { color: colors.danger },
  status: { color: colors.text, fontWeight: "600" }
});
