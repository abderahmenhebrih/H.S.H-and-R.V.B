import React, { useState } from "react";
import { View, Text, StyleSheet, Image, Alert, Pressable, Platform } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Button } from "@/components/common/Button";
import { useAuthStore } from "@/stores/auth-store";
import { pickImageFromGallery, takePhotoWithCamera, compressToProfilePicture } from "@/utils/image";
import { RvbApiError } from "@/types/rvb";

export default function OnboardingScreen() {
  const { account, completeOnboarding, isLoading } = useAuthStore();
  const [preview, setPreview] = useState<string | null>(account?.profilePicture || null);
  const [compressed, setCompressed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sizeInfo, setSizeInfo] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handlePick = async (fromCamera: boolean) => {
    setError(null);
    setSizeInfo(null);
    setProcessing(true);
    try {
      const picked = fromCamera ? await takePhotoWithCamera() : await pickImageFromGallery();
      if (picked.error) {
        setError(picked.error);
        setProcessing(false);
        return;
      }
      if (picked.cancelled || !picked.uri) {
        setProcessing(false);
        return;
      }
      const { base64, size } = await compressToProfilePicture(picked.uri);
      setPreview(base64);
      setCompressed(base64);
      setSizeInfo(`${Math.round(size / 1024)} KB — 512×512 JPEG`);
      if (size > 200 * 1024) {
        setError(`Image is ${Math.round(size / 1024)} KB, target <200 KB. Try a simpler photo.`);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to process image");
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!compressed && !preview) {
      setError("Profile picture is required");
      return;
    }
    const payload = compressed || preview;
    if (!payload) {
      setError("Select a photo first");
      return;
    }
    try {
      await completeOnboarding(payload);
    } catch (e: any) {
      if (e instanceof RvbApiError) setError(e.message);
      else setError(e?.message || "Onboarding failed");
    }
  };

  return (
    <Screen scroll padded>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to R.V.B</Text>
        <Text style={styles.subtitle}>Set your profile picture to complete onboarding</Text>
        {account ? <Text style={styles.account}>{account.displayName} @{account.tag} • {account.role}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.previewWrap}>
          {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : <View style={styles.placeholder}><Text style={styles.placeholderText}>No photo</Text></View>}
        </View>
        {sizeInfo ? <Text style={styles.sizeInfo}>{sizeInfo}</Text> : null}

        <View style={styles.actions}>
          <Button title={processing ? "Processing..." : "Gallery"} onPress={() => handlePick(false)} variant="secondary" disabled={processing || isLoading} />
          <Button title={processing ? "Processing..." : "Camera"} onPress={() => handlePick(true)} variant="secondary" disabled={processing || isLoading} />
        </View>

        {preview ? (
          <Pressable onPress={() => { setPreview(null); setCompressed(null); setSizeInfo(null); }} style={styles.retake}>
            <Text style={styles.retakeText}>Clear / retake</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Complete onboarding" onPress={handleSubmit} loading={isLoading} disabled={!preview} />
        <Text style={styles.hint}>512×512 JPEG, &lt;200 KB target (backend &lt;250 KB). Cropped to square.</Text>
        {Platform.OS === "web" ? <Text style={styles.webNote}>On web, use Gallery. Camera requires device.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  subtitle: { marginTop: 6, color: "#64748B", textAlign: "center" },
  account: { marginTop: 6, color: "#0F766E", fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#E2E8F0" },
  previewWrap: { alignItems: "center", marginBottom: 12 },
  preview: { width: 160, height: 160, borderRadius: 80, backgroundColor: "#E2E8F0" },
  placeholder: { width: 160, height: 160, borderRadius: 80, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E2E8F0" },
  placeholderText: { color: "#94A3B8" },
  sizeInfo: { textAlign: "center", color: "#64748B", fontSize: 12, marginBottom: 8 },
  actions: { flexDirection: "row", gap: 12, justifyContent: "center", marginBottom: 8 },
  retake: { alignItems: "center", marginBottom: 8 },
  retakeText: { color: "#0F766E", fontSize: 13, fontWeight: "600" },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8 },
  hint: { marginTop: 12, color: "#94A3B8", fontSize: 11, textAlign: "center" },
  webNote: { marginTop: 6, color: "#94A3B8", fontSize: 11, textAlign: "center" },
});
