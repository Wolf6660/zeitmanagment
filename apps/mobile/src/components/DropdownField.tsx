import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Option = {
  label: string;
  value: string;
};

type Props = {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function DropdownField({ label, options, value, onChange, placeholder = "Bitte auswaehlen" }: Props) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.value === value)?.label ?? placeholder;
  }, [options, value, placeholder]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen((x) => !x)}>
        <Text style={styles.fieldText}>{selectedLabel}</Text>
        <Text style={styles.chevron}>{open ? "v" : ">"}</Text>
      </Pressable>

      {open && (
        <View style={styles.listWrap}>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            scrollEnabled={options.length > 5}
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  style={[styles.item, active && styles.itemActive]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
                </Pressable>
              );
            }}
          />
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
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  fieldText: { color: colors.text, fontWeight: "600", flex: 1 },
  chevron: { color: colors.muted, fontWeight: "700", marginLeft: 8 },
  listWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden"
  },
  item: { paddingHorizontal: 10, paddingVertical: 10 },
  itemActive: { backgroundColor: "#EEF2FF" },
  itemText: { color: colors.text },
  itemTextActive: { color: "#2563EB", fontWeight: "700" }
});
