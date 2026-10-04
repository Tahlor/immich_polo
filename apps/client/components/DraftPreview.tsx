import { Image, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { bearerHeaders, pickerThumbnailUrl } from "../lib/api";
import type { DraftMedia } from "../lib/compose";

function LocalVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.media} />;
}

export function DraftPreview({ media, token, connectionId }: { media: DraftMedia; token: string; connectionId: string }) {
  return (
    <View style={styles.frame}>
      {media.source === "immich" ? (
        <>
          <Image source={{ uri: pickerThumbnailUrl(connectionId, media.asset.id), headers: bearerHeaders(token) }} resizeMode="contain" style={styles.media} />
          <Text>Immich · {media.asset.type}{media.asset.capturedAt ? ` · ${new Date(media.asset.capturedAt).toLocaleDateString()}` : ""}</Text>
        </>
      ) : (
        <>
          {media.mediaType === "video" ? <LocalVideo uri={media.file.uri} /> : <Image source={{ uri: media.file.uri }} resizeMode="contain" style={styles.media} />}
          <Text>{media.source === "camera" ? "Camera recording" : "Phone library"} · {media.file.filename}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { gap: 8 },
  media: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: "#111" },
});
