import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DropdownField } from "../components/DropdownField";
import type { ApiClient } from "../services/api";
import type { EmployeeRow, LeaveKind, LeaveRequestRow, SessionUser } from "../types/app";
import { colors } from "../theme/colors";
import { DateTimePickerField } from "../components/DateTimePickerField";

type RequestMode = LeaveKind | "BREAK_CREDIT" | "SICK_LEAVE";
type RequestView = "MENU" | RequestMode;

type Props = {
  api: ApiClient;
  user: SessionUser;
};

export function RequestsScreen({ api, user }: Props) {
  const isLead = user.role === "SUPERVISOR" || user.role === "ADMIN";

  const [view, setView] = useState<RequestView>("MENU");

  const [rows, setRows] = useState<LeaveRequestRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(user.id);

  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date>(new Date());
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const modeButtons = useMemo(() => {
    const base: RequestMode[] = ["VACATION", "OVERTIME", "BREAK_CREDIT"];
    if (isLead) base.push("SICK_LEAVE");
    return base;
  }, [isLead]);

  const activeRows = employees.filter((e) => e.isActive);

  const load = async () => {
    try {
      const [myRows, employeeRows] = await Promise.all([
        api.myRequests(),
        isLead ? api.employees() : Promise.resolve([])
      ]);
      setRows(myRows);
      setEmployees(employeeRows);
      if (isLead && employeeRows.length > 0 && !employeeRows.some((x) => x.id === selectedUserId)) {
        setSelectedUserId(employeeRows[0].id);
      }
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedEmployee = employees.find((x) => x.id === selectedUserId);

  const resetForm = () => {
    setStartAt(new Date());
    setEndAt(new Date());
    setMinutes("30");
    setNote("");
  };

  const closeDetail = () => {
    resetForm();
    setView("MENU");
  };

  const submit = async (mode: RequestMode) => {
    try {
      const startDate = startAt.toISOString().slice(0, 10);
      const endDate = endAt.toISOString().slice(0, 10);

      if (mode === "VACATION" || mode === "OVERTIME") {
        await api.createLeave(mode, startDate, endDate, note);
        setStatus("Antrag erstellt.");
      } else if (mode === "BREAK_CREDIT") {
        const parsedMinutes = Number(minutes);
        if (!Number.isFinite(parsedMinutes) || parsedMinutes < 1) {
          throw new Error("Bitte gueltige Minuten eingeben.");
        }
        if (isLead && selectedUserId && selectedUserId !== user.id) {
          await api.createBreakCredit(selectedUserId, `${startDate}T00:00:00.000Z`, parsedMinutes, note);
          setStatus("Pausengutschrift eingetragen.");
        } else {
          await api.createBreakCreditRequest(startDate, parsedMinutes, note);
          setStatus("Pausengutschrift-Antrag erstellt.");
        }
      } else if (mode === "SICK_LEAVE") {
        if (!isLead) throw new Error("Keine Berechtigung.");
        if (!selectedUserId) throw new Error("Bitte Mitarbeiter waehlen.");
        await api.createSickLeave(selectedUserId, `${startDate}T00:00:00.000Z`, `${endDate}T23:59:59.999Z`, note);
        setStatus("Krankmeldung eingetragen.");
      }

      await load();
      closeDetail();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const renderEmployeeSelector = () => {
    if (!isLead) return null;
    return (
      <View style={styles.employeeWrap}>
        <DropdownField
          label="Mitarbeiter"
          options={activeRows.map((r) => ({ label: `${r.name} (${r.loginName})`, value: r.id }))}
          value={selectedUserId}
          onChange={setSelectedUserId}
          placeholder="Mitarbeiter waehlen"
        />
        {!!selectedEmployee && <Text style={styles.employeeHint}>Ausgewaehlt: {selectedEmployee.name}</Text>}
      </View>
    );
  };

  const renderDetail = (mode: RequestMode) => {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{modeLabel(mode)}</Text>

        <View style={styles.card}>
          {renderEmployeeSelector()}

          <DateTimePickerField label="Start / Datum" value={startAt} mode="date" onChange={setStartAt} />

          {(mode === "VACATION" || mode === "OVERTIME" || mode === "SICK_LEAVE") && (
            <DateTimePickerField label="Ende" value={endAt} mode="date" onChange={setEndAt} />
          )}

          {mode === "BREAK_CREDIT" && (
            <TextInput
              value={minutes}
              onChangeText={setMinutes}
              placeholder="Minuten (z. B. 30)"
              keyboardType="numeric"
              style={styles.input}
            />
          )}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={mode === "SICK_LEAVE" ? "Notiz zur Krankmeldung" : "Notiz"}
            style={styles.input}
          />

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryButton} onPress={closeDetail}>
              <Text style={styles.secondaryButtonText}>Abbrechen</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => void submit(mode)}>
              <Text style={styles.buttonText}>{submitLabel(mode, isLead, selectedUserId !== user.id)}</Text>
            </Pressable>
          </View>
        </View>

        {!!status && <Text style={styles.status}>{status}</Text>}
      </View>
    );
  };

  if (view !== "MENU") {
    return renderDetail(view);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Antraege</Text>

      <View style={styles.card}>
        <Text style={styles.section}>Bereich auswaehlen</Text>
        <View style={styles.menuGrid}>
          {modeButtons.map((entryMode) => (
            <Pressable key={entryMode} style={styles.menuButton} onPress={() => setView(entryMode)}>
              <Text style={styles.menuButtonTitle}>{modeLabel(entryMode)}</Text>
              <Text style={styles.menuButtonText}>Formular oeffnen</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!!status && <Text style={styles.status}>{status}</Text>}

      <Text style={styles.section}>Meine letzten Antraege</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.listCard}>
            <Text style={styles.rowTitle}>{item.kind === "VACATION" ? "Urlaub" : "Ueberstunden"}</Text>
            <Text style={styles.rowText}>
              {item.startDate.slice(0, 10)} bis {item.endDate.slice(0, 10)}
            </Text>
            <Text style={styles.rowText}>Status: {item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

function modeLabel(mode: RequestMode): string {
  if (mode === "VACATION") return "Urlaub";
  if (mode === "OVERTIME") return "Ueberstunden";
  if (mode === "BREAK_CREDIT") return "Pausengutschrift";
  return "Krank";
}

function submitLabel(mode: RequestMode, isLead: boolean, forOtherEmployee: boolean): string {
  if (mode === "BREAK_CREDIT") {
    if (isLead && forOtherEmployee) return "Pausengutschrift buchen";
    return "Pausengutschrift senden";
  }
  if (mode === "SICK_LEAVE") return "Speichern";
  return "Speichern";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14, gap: 10 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  section: { fontWeight: "700", color: colors.text },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  menuButton: {
    width: "48%",
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 6
  },
  menuButtonTitle: { color: colors.text, fontWeight: "700", textAlign: "center" },
  menuButtonText: { color: colors.muted, fontSize: 12, textAlign: "center" },
  employeeWrap: { gap: 6 },
  employeeHint: { color: colors.muted, fontSize: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 9 },
  actionRow: { flexDirection: "row", gap: 8 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 11 },
  buttonText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  secondaryButton: { flex: 1, backgroundColor: "#E2E8F0", borderRadius: 10, alignItems: "center", paddingVertical: 11 },
  secondaryButtonText: { color: colors.text, fontWeight: "700", textAlign: "center" },
  status: { color: colors.text },
  listCard: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10 },
  rowTitle: { fontWeight: "700", color: colors.text },
  rowText: { color: colors.muted }
});
