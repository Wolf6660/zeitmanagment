import CryptoJS from "crypto-js";
import type { ProvisioningPayload } from "../types/app";

const QR_PREFIX = "ZMOBILE1:";
// Dieser Key muss identisch mit dem QR-Encoder sein.
const PROVISIONING_SECRET = "zm-mobile-bootstrap-v1";

export function decodeProvisioningQr(qrValue: string): ProvisioningPayload {
  const normalized = qrValue.trim();
  if (!normalized.startsWith(QR_PREFIX)) {
    throw new Error("Ungueltiger QR-Code. Erwartet wird das Format ZMOBILE1.");
  }

  const encrypted = normalized.slice(QR_PREFIX.length);
  if (!encrypted) {
    throw new Error("QR-Code enthaelt keine Daten.");
  }

  const bytes = CryptoJS.AES.decrypt(encrypted, PROVISIONING_SECRET);
  const plain = bytes.toString(CryptoJS.enc.Utf8);
  if (!plain) {
    throw new Error("QR-Code konnte nicht entschluesselt werden.");
  }

  const parsed = JSON.parse(plain) as ProvisioningPayload;
  if (!parsed.apiBaseUrl || !/^https?:\/\//i.test(parsed.apiBaseUrl)) {
    throw new Error("API-URL fehlt oder ist ungueltig.");
  }

  return {
    apiBaseUrl: parsed.apiBaseUrl.replace(/\/$/, ""),
    loginName: parsed.loginName,
    password: parsed.password
  };
}
