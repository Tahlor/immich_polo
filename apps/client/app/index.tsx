import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthorizedImage } from "../components/AuthorizedImage";
import { AuthorizedVideo } from "../components/AuthorizedVideo";
import {
  bearerHeaders,
  createImmichConnection,
  createPostFromImmich,
  createThread,
  getMe,
  listImmichAssets,
  listImmichConnections,
  listPosts,
  listThreads,
  listUsers,
  login,
  logout,
  pickerThumbnailUrl,
  POLO_API_URL,
  PoloApiError,
  register,
  uploadLocalPost,
  type ImmichAsset,
  type ImmichConnection,
  type LocalUploadFile,
  type PostSummary,
  type PublicUser,
  type ThreadSummary,
} from "../lib/api";
import { clearSessionToken, loadSessionToken, saveSessionToken } from "../lib/session";

type AppSession = { token: string; user: PublicUser };
type AuthMode = "login" | "register";

const DEFAULT_IMMICH_URL = process.env.EXPO_PUBLIC_DEFAULT_IMMICH_URL ?? "";

function errorMessage(error: unknown): string {
  if (error instanceof PoloApiError) return error.code.replaceAll("_", " ");
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function filenameFor(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.fileName) return asset.fileName;
  const extension = asset.type === "video" ? "mp4" : "jpg";
  return `polo-${Date.now()}.${extension}`;
}

function contentTypeFor(asset: ImagePicker.ImagePickerAsset): string {
  return asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
}

function toLocalUploadFile(asset: ImagePicker.ImagePickerAsset): LocalUploadFile {
  return {
    uri: asset.uri,
    filename: filenameFor(asset),
    contentType: contentTypeFor(asset),
    ...(asset.file ? { webFile: asset.file } : {}),
  };
}

function scheduleFromMinutes(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Schedule minutes must be greater than zero");
  return new Date(Date.now() + minutes * 60_000).toISOString();
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
  const [connections, setConnections] = useState<ImmichConnection[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [immichUrl, setImmichUrl] = useState(DEFAULT_IMMICH_URL);
  const [immichApiKey, setImmichApiKey] = useState("");
  const [showImmichPicker, setShowImmichPicker] = useState(false);
  const [immichAssets, setImmichAssets] = useState<ImmichAsset[]>([]);
  const [immichNextCursor, setImmichNextCursor] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [scheduleMinutes, setScheduleMinutes] = useState("");

  const primaryConnection = connections[0] ?? null;
  const otherUsers = useMemo(
    () => users.filter((user) => user.id !== session?.user.id),
    [users, session?.user.id],
  );

  const refreshHome = useCallback(async (current: AppSession) => {
    const [nextThreads, nextUsers, nextConnections] = await Promise.all([
      listThreads(current.token),
      listUsers(current.token),
      listImmichConnections(current.token),
    ]);
    setThreads(nextThreads);
    setUsers(nextUsers);
    setConnections(nextConnections);
  }, []);

  const refreshPosts = useCallback(async (current: AppSession, threadId: string) => {
    setPosts(await listPosts(current.token, threadId));
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
        const current = { token, user };
        await refreshHome(current);
        if (active) setSession(current);
      } catch {
        await clearSessionToken();
        if (active) setSession(null);
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
      await refreshHome(current);
      setSession(current);
      setPassword("");
      setRegistrationSecret("");
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
    setConnections([]);
    setImmichAssets([]);
    await clearSessionToken();
    if (current) {
      try { await logout(current.token); } catch { /* Local logout still clears this device. */ }
    }
  };

  const openThread = async (thread: ThreadSummary) => {
    if (!session) return;
    setSelectedThread(thread);
    setShowImmichPicker(false);
    setBusy(true);
    setError(null);
    try {
      await refreshPosts(session, thread.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
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

  const connectImmich = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await createImmichConnection(session.token, immichUrl.trim(), immichApiKey.trim());
      setImmichApiKey("");
      setShowConnectionForm(false);
      await refreshHome(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const loadImmichPicker = async (cursor?: string) => {
    if (!session || !primaryConnection) return;
    setBusy(true);
    setError(null);
    try {
      const page = await listImmichAssets(session.token, primaryConnection.id, { limit: 40, ...(cursor ? { cursor } : {}) });
      setImmichAssets((current) => cursor ? [...current, ...page.assets] : page.assets);
      setImmichNextCursor(page.nextCursor);
      setShowImmichPicker(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const postExisting = async (asset: ImmichAsset) => {
    if (!session || !selectedThread || !primaryConnection) return;
    setBusy(true);
    setError(null);
    try {
      const visibleAt = scheduleFromMinutes(scheduleMinutes);
      await createPostFromImmich(session.token, selectedThread.id, {
        connectionId: primaryConnection.id,
        assetId: asset.id,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        ...(visibleAt ? { visibleAt } : {}),
      });
      setCaption("");
      setScheduleMinutes("");
      setShowImmichPicker(false);
      await refreshPosts(session, selectedThread.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const uploadPickedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!session || !selectedThread || !primaryConnection) return;
    setBusy(true);
    setError(null);
    try {
      const visibleAt = scheduleFromMinutes(scheduleMinutes);
      const capturedAt = asset.exif && typeof asset.exif.DateTimeOriginal === "string"
        ? new Date(asset.exif.DateTimeOriginal).toISOString()
        : undefined;
      await uploadLocalPost(
        session.token,
        selectedThread.id,
        primaryConnection.id,
        toLocalUploadFile(asset),
        {
          ...(capturedAt ? { capturedAt } : {}),
          ...(visibleAt ? { visibleAt } : {}),
        },
      );
      setCaption("");
      setScheduleMinutes("");
      await refreshPosts(session, selectedThread.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const chooseDeviceMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 1,
      exif: true,
    });
    if (!result.canceled && result.assets[0]) await uploadPickedAsset(result.assets[0]);
  };

  const recordVideo = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to record a Polo");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      quality: 1,
      videoMaxDuration: 20 * 60,
    });
    if (!result.canceled && result.assets[0]) await uploadPickedAsset(result.assets[0]);
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
          <Text style={styles.body}>Polo owns the conversation. Immich owns every canonical photo and video.</Text>
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
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.rowBetween}>
            <Pressable onPress={() => { setSelectedThread(null); setPosts([]); setShowImmichPicker(false); }}><Text style={styles.link}>‹ Conversations</Text></Pressable>
            <Pressable onPress={() => void refreshPosts(session, selectedThread.id)}><Text style={styles.link}>Refresh</Text></Pressable>
          </View>
          <Text style={styles.titleSmall}>{selectedThread.title ?? selectedThread.members.map((member) => member.displayName).join(" + ")}</Text>

          {posts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.cardTitle}>No polos yet</Text>
              <Text style={styles.bodySmall}>Post something from Immich, your phone, or the camera.</Text>
            </View>
          ) : posts.map((post) => {
            const asset = post.assets[0];
            return (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{post.authorDisplayName}</Text>
                  <Text style={styles.muted}>{post.status === "scheduled" ? `Scheduled ${new Date(post.visibleAt).toLocaleString()}` : new Date(post.publishedAt ?? post.createdAt).toLocaleString()}</Text>
                </View>
                {post.caption && <Text style={styles.bodySmall}>{post.caption}</Text>}
                {asset?.mediaType === "video" && <AuthorizedVideo token={session.token} postId={post.id} postAssetId={asset.id} />}
                {asset?.mediaType === "image" && <AuthorizedImage token={session.token} postId={post.id} postAssetId={asset.id} />}
                {!asset && <Text style={styles.muted}>Media unavailable</Text>}
              </View>
            );
          })}

          {error && <Text style={styles.error}>{error}</Text>}

          {!primaryConnection ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Connect Immich first</Text>
              <Text style={styles.bodySmall}>Your API key is sent to Polo over HTTPS, encrypted server-side, and is never shared with conversation recipients.</Text>
              <Pressable onPress={() => setShowConnectionForm(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Connect Immich</Text></Pressable>
            </View>
          ) : (
            <View style={styles.composer}>
              <Text style={styles.sectionTitle}>Send a Polo</Text>
              <TextInput value={caption} onChangeText={setCaption} placeholder="Caption (optional)" style={styles.input} />
              <TextInput value={scheduleMinutes} onChangeText={setScheduleMinutes} placeholder="Schedule in minutes (blank = now)" keyboardType="numeric" style={styles.input} />
              <View style={styles.actionRow}>
                <Pressable disabled={busy} onPress={() => void loadImmichPicker()} style={styles.actionButton}><Text style={styles.buttonText}>Immich</Text></Pressable>
                <Pressable disabled={busy} onPress={() => void chooseDeviceMedia()} style={styles.actionButton}><Text style={styles.buttonText}>Phone</Text></Pressable>
                <Pressable disabled={busy} onPress={() => void recordVideo()} style={styles.actionButton}><Text style={styles.buttonText}>Record</Text></Pressable>
              </View>
              <Text style={styles.note}>Connected to Immich {primaryConnection.serverVersion}. New phone/camera media uploads to Immich first; Polo stores only the canonical asset reference.</Text>
            </View>
          )}

          {showImmichPicker && primaryConnection && (
            <View style={styles.section}>
              <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Your Immich library</Text><Pressable onPress={() => setShowImmichPicker(false)}><Text style={styles.link}>Close</Text></Pressable></View>
              <View style={styles.assetGrid}>
                {immichAssets.map((asset) => (
                  <Pressable key={asset.id} disabled={busy} onPress={() => void postExisting(asset)} style={styles.assetCard}>
                    <Image
                      source={{ uri: pickerThumbnailUrl(primaryConnection.id, asset.id), headers: bearerHeaders(session.token) }}
                      style={styles.assetImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.muted}>{asset.type}{asset.capturedAt ? ` · ${new Date(asset.capturedAt).toLocaleDateString()}` : ""}</Text>
                  </Pressable>
                ))}
              </View>
              {immichNextCursor && <Pressable disabled={busy} onPress={() => void loadImmichPicker(immichNextCursor)} style={styles.actionButton}><Text style={styles.buttonText}>Load more</Text></Pressable>}
            </View>
          )}

          {showConnectionForm && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Connect Immich</Text>
              <TextInput value={immichUrl} onChangeText={setImmichUrl} placeholder="Immich server URL" autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <TextInput value={immichApiKey} onChangeText={setImmichApiKey} placeholder="Permission-scoped API key" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <Pressable disabled={busy || !immichUrl.trim() || !immichApiKey.trim()} onPress={() => void connectImmich()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Verify & save</Text></Pressable>
              <Pressable onPress={() => setShowConnectionForm(false)}><Text style={styles.link}>Cancel</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.rowBetween}>
          <View><Text style={styles.eyebrow}>IMMICH POLO</Text><Text style={styles.titleSmall}>Hi, {session.user.displayName}</Text></View>
          <Pressable onPress={() => void signOut()}><Text style={styles.link}>Log out</Text></Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Immich</Text>
            {primaryConnection && <Text style={styles.muted}>v{primaryConnection.serverVersion}</Text>}
          </View>
          {primaryConnection ? (
            <View style={styles.threadCard}>
              <Text style={styles.cardTitle}>Connected</Text>
              <Text style={styles.muted}>{primaryConnection.baseUrl}</Text>
            </View>
          ) : (
            <Pressable onPress={() => setShowConnectionForm((value) => !value)} style={styles.threadCard}>
              <Text style={styles.cardTitle}>Connect your Immich library</Text>
              <Text style={styles.muted}>Required before posting media.</Text>
            </Pressable>
          )}
          {showConnectionForm && (
            <View style={styles.card}>
              <TextInput value={immichUrl} onChangeText={setImmichUrl} placeholder="Immich server URL" autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <TextInput value={immichApiKey} onChangeText={setImmichApiKey} placeholder="Permission-scoped API key" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <Pressable disabled={busy || !immichUrl.trim() || !immichApiKey.trim()} onPress={() => void connectImmich()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Verify & save</Text></Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Conversations</Text><Pressable onPress={() => void refreshHome(session)}><Text style={styles.link}>Refresh</Text></Pressable></View>
          {threads.length === 0 ? <Text style={styles.muted}>No conversations yet.</Text> : threads.map((thread) => (
            <Pressable key={thread.id} onPress={() => void openThread(thread)} style={styles.threadCard}>
              <Text style={styles.cardTitle}>{thread.title ?? (thread.members.filter((member) => member.id !== session.user.id).map((member) => member.displayName).join(", ") || "Just me")}</Text>
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
        <Text style={styles.note}>Native Android uses protected token storage. Universal SSO is not required for Polo API access.</Text>
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
  composer: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  assetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  assetCard: { width: "48%", borderWidth: 1, borderRadius: 14, overflow: "hidden", paddingBottom: 8, gap: 6 },
  assetImage: { width: "100%", aspectRatio: 1 },
});
