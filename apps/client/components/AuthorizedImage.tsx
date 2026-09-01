import { useEffect } from "react";
import { Image, StyleSheet } from "react-native";
import { bearerHeaders, postMediaUrl, updatePostView } from "../lib/api";

interface Props {
  token: string;
  postId: string;
  postAssetId: string;
}

export function AuthorizedImage({ token, postId, postAssetId }: Props) {
  useEffect(() => {
    void updatePostView(token, postId).catch(() => undefined);
  }, [postId, token]);

  return (
    <Image
      source={{ uri: postMediaUrl(postId, postAssetId), headers: bearerHeaders(token) }}
      resizeMode="contain"
      style={styles.image}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: "#111" },
});
