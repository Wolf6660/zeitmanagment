import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { colors } from "../theme/colors";

type PickerMode = "date" | "time";

type Props = {
  label: string;
  value: Date;
  mode: PickerMode;
  onChange: (next: Date) => void;
};

export function DateTimePickerField({ label, value, mode, onChange }: Props) {
  const [showIosPicker, setShowIosPicker] = useState(false);

  const textValue = useMemo(() => {
    if (mode === "date") {
      return value.toISOString().slice(0, 10);
    }
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }, [mode, value]);

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type !== "set" || !selected) return;
          const merged = new Date(value.getTime());
          if (mode === "date") {
            merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          } else {
            merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          }
          onChange(merged);
        }
      });
      return;
    }
    setShowIosPicker(true);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openPicker}>
        <Text style={styles.fieldText}>{textValue}</Text>
      </Pressable>

      {Platform.OS === "ios" && showIosPicker && (
        <View style={styles.iosWrap}>
          <DateTimePicker
            value={value}
            mode={mode}
            display={mode === "date" ? "inline" : "spinner"}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (!selected) return;
              const merged = new Date(value.getTime());
              if (mode === "date") {
                merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
              } else {
                merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
              }
              onChange(merged);
            }}
          />
          <Pressable style={styles.doneButton} onPress={() => setShowIosPicker(false)}>
            <Text style={styles.doneText}>Fertig</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.text, fontWeight: "600" },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#fff"
  },
  fieldText: { color: colors.text, fontWeight: "600" },
  iosWrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden"
  },
  doneButton: { alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  doneText: { color: colors.primary, fontWeight: "700" }
});
