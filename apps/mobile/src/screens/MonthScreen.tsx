import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ApiClient } from "../services/api";
import type { ClockType, EmployeeRow, SessionUser } from "../types/app";
import { colors } from "../theme/colors";
import { DateTimePickerField } from "../components/DateTimePickerField";

type DayEvent = {
  localId: string;
  type: ClockType;
  at: Date;
};

type DayRow = {
  date: string;
  workedHours: number;
  plannedHours: number;
  entries: Array<{ id: string; type: ClockType; time: string }>;
};

type Props = {
  api: ApiClient;
  user: SessionUser;
};

function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseDayTime(dateIso: string, hhmm: string): Date {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map((x) => Number(x));
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const out = new Date();
  out.setFullYear(y, (m || 1) - 1, d || 1);
  out.setHours(hh || 0, mm || 0, 0, 0);
  return out;
}

export function MonthScreen({ api, user }: Props) {
  const isLead = user.role === "SUPERVISOR" || user.role === "ADMIN";
  const [selfCorrectionMaxDays, setSelfCorrectionMaxDays] = useState(3);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(user.id);

  const [summary, setSummary] = useState<{ worked: number; planned: number; days: DayRow[] } | null>(null);
  const [editingDay, setEditingDay] = useState<DayRow | null>(null);
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [editNote, setEditNote] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yearMonth = useMemo(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }, []);

  const loadMonth = async (targetUserId: string) => {
    try {
      setError(null);
      const res = await api.monthView(targetUserId, yearMonth.year, yearMonth.month);
      const days = res.days.map((d) => ({
        date: d.date,
        workedHours: d.workedHours,
        plannedHours: d.plannedHours,
        entries: d.entries.map((e) => ({ id: e.id, type: e.type, time: e.time }))
      }));
      setSummary({ worked: res.monthWorked, planned: res.monthPlanned, days });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    const run = async () => {
      const cfg = await api.publicConfig().catch(() => ({ selfCorrectionMaxDays: 3 }));
      setSelfCorrectionMaxDays(Number(cfg.selfCorrectionMaxDays ?? 3));
      if (isLead) {
        const rows = await api.employees();
        const active = rows.filter((x) => x.isActive);
        setEmployees(active);
        if (active.length > 0) {
          const preferred = active.some((x) => x.id === selectedUserId) ? selectedUserId : active[0].id;
          setSelectedUserId(preferred);
          await loadMonth(preferred);
          return;
        }
      }
      await loadMonth(user.id);
    };

    run().catch((e) => setError((e as Error).message));
  }, []);

  const isDayEditableBySelf = (dateIso: string): boolean => {
    const target = new Date(`${dateIso.slice(0, 10)}T00:00:00`);
    const now = new Date();
    const todayStart = new Date(now.getTime());
    todayStart.setHours(0, 0, 0, 0);
    const earliest = new Date(todayStart.getTime());
    earliest.setDate(earliest.getDate() - selfCorrectionMaxDays);
    return target.getTime() >= earliest.getTime() && target.getTime() <= todayStart.getTime();
  };

  const openDayEditor = (day: DayRow) => {
    setEditingDay(day);
    setEvents(
      day.entries.map((entry, idx) => ({
        localId: `${entry.id}-${idx}`,
        type: entry.type,
        at: parseDayTime(day.date, entry.time)
      }))
    );
    setEditNote("");
    setStatus(null);
  };

  const selectedEmployee = employees.find((x) => x.id === selectedUserId);

  if (editingDay) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Tag bearbeiten</Text>
        <Text style={styles.subtitle}>{editingDay.date.slice(0, 10)}</Text>

        <FlatList
          data={events}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={{ gap: 10 }}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <Text style={styles.section}>Eintrag {index + 1}</Text>
              <View style={styles.rowWrap}>
                <Pressable
                  style={[styles.chip, item.type === "CLOCK_IN" && styles.chipActive]}
                  onPress={() => {
                    setEvents((prev) => prev.map((e) => (e.localId === item.localId ? { ...e, type: "CLOCK_IN" } : e)));
                  }}
                >
                  <Text style={styles.chipText}>Kommen</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, item.type === "CLOCK_OUT" && styles.chipActive]}
                  onPress={() => {
                    setEvents((prev) => prev.map((e) => (e.localId === item.localId ? { ...e, type: "CLOCK_OUT" } : e)));
                  }}
                >
                  <Text style={styles.chipText}>Gehen</Text>
                </Pressable>
              </View>

              <DateTimePickerField
                label="Uhrzeit"
                value={item.at}
                mode="time"
                onChange={(next) => {
                  setEvents((prev) => prev.map((e) => (e.localId === item.localId ? { ...e, at: next } : e)));
                }}
              />

              <Pressable
                style={styles.deleteButton}
                onPress={() => setEvents((prev) => prev.filter((e) => e.localId !== item.localId))}
              >
                <Text style={styles.deleteText}>Loeschen</Text>
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: 10, marginTop: 10, paddingBottom: 20 }}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setEvents((prev) => [
                    ...prev,
                    {
                      localId: `new-${Date.now()}-${prev.length}`,
                      type: "CLOCK_IN",
                      at: parseDayTime(editingDay.date, "08:00")
                    }
                  ]);
                }}
              >
                <Text style={styles.secondaryButtonText}>Eintrag hinzufuegen</Text>
              </Pressable>

              <TextInput
                value={editNote}
                onChangeText={setEditNote}
                style={styles.input}
                placeholder="Notiz fuer die Aenderung"
              />

              {!!status && <Text style={styles.status}>{status}</Text>}

              <View style={styles.rowWrap}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setEditingDay(null);
                    setEvents([]);
                    setEditNote("");
                    setStatus(null);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Abbrechen</Text>
                </Pressable>
                <Pressable
                  style={styles.button}
                  onPress={async () => {
                    try {
                      if (events.length === 0) {
                        throw new Error("Mindestens ein Eintrag muss vorhanden sein.");
                      }
                      const payloadEvents = [...events]
                        .sort((a, b) => a.at.getTime() - b.at.getTime())
                        .map((e) => ({ type: e.type, time: formatHHMM(e.at) }));
                      if (isLead) {
                        await api.dayOverride(selectedUserId, editingDay.date.slice(0, 10), editNote, payloadEvents);
                      } else {
                        await api.dayOverrideSelf(editingDay.date.slice(0, 10), editNote, payloadEvents);
                      }
                      setStatus("Tag gespeichert.");
                      await loadMonth(selectedUserId);
                      setEditingDay(null);
                      setEvents([]);
                      setEditNote("");
                    } catch (e) {
                      setStatus((e as Error).message);
                    }
                  }}
                >
                  <Text style={styles.buttonText}>Speichern</Text>
                </Pressable>
              </View>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Monat</Text>

      {isLead && (
        <View style={styles.card}>
          <Text style={styles.section}>Mitarbeiter waehlen</Text>
          <FlatList
            horizontal
            data={employees}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 6 }}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.employeeChip, selectedUserId === item.id && styles.employeeChipActive]}
                onPress={() => {
                  setSelectedUserId(item.id);
                  setStatus(null);
                  void loadMonth(item.id);
                }}
              >
                <Text style={styles.employeeChipText}>{item.name}</Text>
              </Pressable>
            )}
          />
          {!!selectedEmployee && <Text style={styles.employeeHint}>Aktiv: {selectedEmployee.name}</Text>}
        </View>
      )}

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : summary ? (
        <>
          <View style={styles.card}>
            <Text style={styles.metric}>Geleistet: {summary.worked.toFixed(2)} h</Text>
            <Text style={styles.metric}>Geplant: {summary.planned.toFixed(2)} h</Text>
          </View>

          <Text style={styles.section}>Tage</Text>
          <FlatList
            data={summary.days}
            keyExtractor={(item) => item.date}
            contentContainerStyle={{ gap: 6, paddingBottom: 20 }}
            renderItem={({ item }) => {
              const canEdit = isLead || isDayEditableBySelf(item.date);
              return (
              <Pressable
                style={[styles.row, !canEdit && styles.rowDisabled]}
                onPress={() => {
                  if (!canEdit) {
                    setStatus(`Dieser Tag liegt ausserhalb der ${selfCorrectionMaxDays}-Tage-Regel und ist nur fuer Vorgesetzte bearbeitbar.`);
                    return;
                  }
                  openDayEditor(item);
                }}
              >
                <View>
                  <Text style={styles.date}>{item.date.slice(0, 10)}</Text>
                  <Text style={styles.entryCount}>
                    {item.entries.length} Eintraege{!canEdit ? " (gesperrt)" : ""}
                  </Text>
                </View>
                <Text style={styles.hours}>
                  {item.workedHours.toFixed(2)} / {item.plannedHours.toFixed(2)} h
                </Text>
              </Pressable>
              );
            }}
          />
        </>
      ) : (
        <Text>Lade Monatsdaten ...</Text>
      )}

      {!!status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14, gap: 10 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.muted, fontWeight: "600" },
  section: { fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 8 },
  metric: { fontWeight: "700", color: colors.text },
  employeeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#fff" },
  employeeChipActive: { borderColor: "#10B981", backgroundColor: "#D1FAE5" },
  employeeChipText: { color: colors.text, fontWeight: "600" },
  employeeHint: { color: colors.muted, fontSize: 12 },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  rowDisabled: { opacity: 0.55 },
  date: { color: colors.text, fontWeight: "600" },
  entryCount: { color: colors.muted, fontSize: 12 },
  hours: { color: colors.muted },
  rowWrap: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#D1FAE5", borderColor: "#10B981" },
  chipText: { color: colors.text, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 9 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 11 },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: "center", paddingVertical: 11, backgroundColor: "#fff" },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  deleteButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  deleteText: { color: colors.danger, fontWeight: "700" },
  error: { color: colors.danger },
  status: { color: colors.text, fontWeight: "600" }
});
