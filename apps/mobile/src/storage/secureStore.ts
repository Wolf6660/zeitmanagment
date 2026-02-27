import * as SecureStore from "expo-secure-store";
import type { Session, StoredProvisioning } from "../types/app";

const KEY_PROVISIONING = "zm_mobile_provisioning";
const KEY_SESSION = "zm_mobile_session";

export async function getProvisioning(): Promise<StoredProvisioning | null> {
  const raw = await SecureStore.getItemAsync(KEY_PROVISIONING);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredProvisioning;
  } catch {
    return null;
  }
}

export async function setProvisioning(value: StoredProvisioning): Promise<void> {
  await SecureStore.setItemAsync(KEY_PROVISIONING, JSON.stringify(value));
}

export async function getSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY_SESSION);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function setSession(value: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY_SESSION, JSON.stringify(value));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_SESSION);
}

export async function resetAll(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PROVISIONING);
  await SecureStore.deleteItemAsync(KEY_SESSION);
}
