import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createThread,
  getMe,
  listPosts,
  listThreads,
  listUsers,
  login,
  logout,
  POLO_API_URL,
  PoloApiError,
  register,
  type PostSummary,
  type PublicUser,
  type ThreadSummary,
} from "../lib/api";
import { clearSessionToken, loadSessionToken, saveSessionToken } from "../lib/session";

type AppSession = { token: string; user: PublicUser };

type AuthMode = "login" | "register";

function errorMessage(error: unknown): string {
  if (error instanceof PoloApiError) return error.code.replaceAll("_", " ");
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

export default function HomeScreen() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [registrationSecret, setRegistrationSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);

  const otherUsers = useMemo(
    () => users.filter((user) => user.id !== session?.user.id),
    [users, session?.user.id],
  );

  const refreshHome = useCallback(async (current: AppSession) => {
    const [nextThreads, nextUsers] = await Promise.all([
      listThreads(current.token),
      listUsers(current.token),
    ]);
    setThreads(nextThreads);
    setUsers(nextUsers);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await loadSessionToken();
      if (!token) {
        if (active) setBooting(false);
        return;
      }
      try {
        const user = await getMe(token);
        if (!active) return;
        const current = { token, user };
        setSession(current);
        await refreshHome(current);
      } catch {
        await clearSessionToken();
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => { active = false; };
  }, [refreshHome]);

  const submitAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = authMode === "login"
        ? await login(username, password)
        : await register({ username, password, displayName, registrationSecret });
      await saveSessionToken(result.token);
      const current = { token: result.token, user: result.user };
      setSession(current);
      setPassword("");
      setRegistrationSecret("");
      await refreshHome(current);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const current = session;
    setSession(null);
    setSelectedThread(null);
    setPosts([]);
    setThreads([]);
    setUsers([]);
    await clearSessionToken();
    if (current) {
      try { await logout(current.token); } catch { /* Local logout still clears this device. */ }
    }
  };

  const startThread = async (otherUser: PublicUser) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const thread = await createThread(session.token, [otherUser.id]);
      await refreshHome(session);
      await openThread(thread);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openThread = async (thread: ThreadSummary) => {
    if (!session) return;
    setSelectedThread(thread);
    setBusy(true);
    setError(null);
    try {
      setPosts(await listPosts(session.token, thread.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (booting) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator /><Text>Opening Polo…</Text></View></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="auto" />
        <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>IMMICH POLO</Text>
          <Text style={styles.title}>An ongoing conversation over your own media.</Text>
          <Text style={styles.body}>Polo owns the conversation. Immich will own every photo and video.</Text>
          <View style={styles.segment}>
            {(["login", "register"] as const).map((mode) => (
              <Pressable key={mode} onPress={() => { setAuthMode(mode); setError(null); }} style={[styles.segmentButton, authMode === mode && styles.segmentSelected]}>
                <Text style={styles.buttonText}>{mode === "login" ? "Log in" : "Create account"}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.card}>
            {authMode === "register" && <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" autoCapitalize="words" style={styles.input} />}
            <TextInput value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" autoCorrect={false} style={styles.input} />
            <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry style={styles.input} />
            {authMode === "register" && <TextInput value={registrationSecret} onChangeText={setRegistrationSecret} placeholder="Household registration secret" secureTextEntry style={styles.input} />}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable disabled={busy} onPress={() => void submitAuth()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{busy ? "Working…" : authMode === "login" ? "Log in" : "Create account"}</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>Server: {POLO_API_URL}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedThread) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="auto" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.rowBetween}>
            <Pressable onPress={() => { setSelectedThread(null); setPosts([]); }}><Text style={styles.link}>‹ Conversations</Text></Pressable>
            <Text style={styles.muted}>{session.user.displayName}</Text>
          </View>
          <Text style={styles.titleSmall}>{selectedThread.title ?? selectedThread.members.map((member) => member.displayName).join(" + ")}</Text>
          {posts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.cardTitle}>No polos yet</Text>
              <Text style={styles.bodySmall}>The conversation model is live. Gallery and Record stay disabled until the real Immich v3 contract tests land.</Text>
            </View>
          ) : posts.map((post) => (
            <View key={post.id} style={styles.postCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{post.authorDisplayName}</Text>
                <Text style={styles.muted}>{post.status === "scheduled" ? `Scheduled ${new Date(post.visibleAt).toLocaleString()}` : new Date(post.publishedAt ?? post.createdAt).toLocaleString()}</Text>
              </View>
              {post.caption && <Text style={styles.bodySmall}>{post.caption}</Text>}
              <Text style={styles.muted}>{post.assets[0]?.mediaType ?? "media"} · media playback pending Immich adapter</Text>
            </View>
          ))}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.composerDisabled}>
            <Text style={styles.buttonText}>Gallery</Text><Text style={styles.muted}>Immich verification pending</Text><Text style={styles.buttonText}>Record</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <View><Text style={styles.eyebrow}>IMMICH POLO</Text><Text style={styles.titleSmall}>Hi, {session.user.displayName}</Text></View>
          <Pressable onPress={() => void signOut()}><Text style={styles.link}>Log out</Text></Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.section}>
          <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Conversations</Text><Pressable onPress={() => void refreshHome(session)}><Text style={styles.link}>Refresh</Text></Pressable></View>
          {threads.length === 0 ? <Text style={styles.muted}>No conversations yet.</Text> : threads.map((thread) => (
            <Pressable key={thread.id} onPress={() => void openThread(thread)} style={styles.threadCard}>
              <Text style={styles.cardTitle}>{thread.title ?? thread.members.filter((member) => member.id !== session.user.id).map((member) => member.displayName).join(", ") || "Just me"}</Text>
              <Text style={styles.muted}>{thread.members.length} member{thread.members.length === 1 ? "" : "s"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Start a conversation</Text>
          {otherUsers.length === 0 ? <Text style={styles.muted}>Create another Polo account to start a conversation.</Text> : otherUsers.map((user) => (
            <Pressable disabled={busy} key={user.id} onPress={() => void startThread(user)} style={styles.threadCard}>
              <Text style={styles.cardTitle}>{user.displayName}</Text><Text style={styles.muted}>@{user.username}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>Media posting is intentionally gated on issues #11–#13 rather than mocked against an assumed Immich API.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  authContainer: { flexGrow: 1, padding: 28, justifyContent: "center", gap: 18, maxWidth: 720, width: "100%", alignSelf: "center" },
  container: { padding: 24, gap: 20, maxWidth: 760, width: "100%", alignSelf: "center" },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  title: { fontSize: 36, lineHeight: 42, fontWeight: "800" },
  titleSmall: { fontSize: 28, lineHeight: 34, fontWeight: "800" },
  body: { fontSize: 18, lineHeight: 27, opacity: 0.78 },
  bodySmall: { fontSize: 15, lineHeight: 22, opacity: 0.82 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  segment: { flexDirection: "row", gap: 8 },
  segmentButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  segmentSelected: { borderWidth: 2 },
  buttonText: { fontWeight: "700" },
  primaryButton: { borderWidth: 2, borderRadius: 14, padding: 14, alignItems: "center" },
  primaryButtonText: { fontWeight: "800", fontSize: 16 },
  error: { fontSize: 14, fontWeight: "700" },
  note: { fontSize: 13, lineHeight: 19, opacity: 0.6 },
  muted: { fontSize: 13, opacity: 0.62 },
  link: { fontWeight: "700", textDecorationLine: "underline" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 19, fontWeight: "800" },
  threadCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 8 },
  postCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 9 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  composerDisabled: { borderWidth: 1, borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, opacity: 0.55 },
});
