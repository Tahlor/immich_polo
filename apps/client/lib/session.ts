import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_KEY = "immich-polo-session-token";
let memoryToken: string | null = null;

export async function loadSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return memoryToken;
    return window.sessionStorage.getItem(SESSION_KEY);
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function saveSessionToken(token: string): Promise<void> {
  memoryToken = token;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.sessionStorage.setItem(SESSION_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  memoryToken = null;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
