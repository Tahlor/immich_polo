import { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { getHealth, POLO_API_URL } from "../lib/api";

type State = "checking" | "connected" | "error";

export default function HomeScreen() {
  const [state, setState] = useState<State>("checking");

  const check = useCallback(async () => {
    setState("checking");
    try {
      await getHealth();
      setState("connected");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>IMMICH POLO</Text>
        <Text style={styles.title}>Your media. One ongoing conversation.</Text>
        <Text style={styles.body}>
          Immich keeps the canonical photos and videos. Polo will add threads, scheduling, watch state, and private sharing.
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>API</Text>
          <Text selectable style={styles.url}>{POLO_API_URL}</Text>
          <Text style={styles.status}>
            {state === "checking" ? "Checking…" : state === "connected" ? "Connected" : "Not reachable"}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void check()} style={styles.button}>
            <Text style={styles.buttonText}>Check again</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>Next product slice: connect Immich, create a thread, then post an existing asset.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 28, justifyContent: "center", gap: 18, maxWidth: 720, width: "100%", alignSelf: "center" },
  eyebrow: { fontSize: 13, fontWeight: "700", letterSpacing: 2 },
  title: { fontSize: 38, lineHeight: 44, fontWeight: "800" },
  body: { fontSize: 18, lineHeight: 27, opacity: 0.78 },
  card: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 10 },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 1.5, opacity: 0.65 },
  url: { fontSize: 14 },
  status: { fontSize: 18, fontWeight: "700" },
  button: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  buttonText: { fontWeight: "700" },
  note: { fontSize: 14, lineHeight: 20, opacity: 0.65 },
});
