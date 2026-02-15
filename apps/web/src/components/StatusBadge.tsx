import React from "react";

type Props = {
  text: string;
  color: string;
};

export function StatusBadge({ text, color }: Props) {
  return (
    <span className="badge" style={{ backgroundColor: color }}>
      {text}
    </span>
  );
}
