import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { bearerHeaders, postMediaUrl, updatePostView } from "../lib/api";

interface Props {
  token: string;
  postId: string;
  postAssetId: string;
}

export function AuthorizedVideo({ token, postId, postAssetId }: Props) {
  const player = useVideoPlayer(
    {
      uri: postMediaUrl(postId, postAssetId),
      headers: bearerHeaders(token),
    },
    (instance) => {
      instance.timeUpdateEventInterval = 2;
    },
  );

  useEffect(() => {
    const subscription = player.addListener("timeUpdate", ({ currentTime }) => {
      void updatePostView(token, postId, Math.max(0, Math.round(currentTime * 1000))).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [player, postId, token]);

  return (
    <View style={styles.frame}>
      <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
});
