declare module "@react-native-community/datetimepicker" {
  import type { ComponentType } from "react";

  export type DateTimePickerEvent = {
    type: "set" | "dismissed" | "neutralButtonPressed";
  };

  export type DateTimePickerProps = {
    value: Date;
    mode?: "date" | "time" | "datetime";
    display?: "default" | "spinner" | "calendar" | "clock" | "inline";
    is24Hour?: boolean;
    onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  };

  export const DateTimePickerAndroid: {
    open: (params: DateTimePickerProps) => void;
  };

  const DateTimePicker: ComponentType<DateTimePickerProps>;
  export default DateTimePicker;
}
