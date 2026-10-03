import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export type PickResult =
  | { type: "success"; uri: string; base64: string }
  | { type: "cancelled" }
  | { type: "permission-denied"; message: string };

async function ensurePermissions(forCamera = false): Promise<{ granted: boolean; message?: string }> {
  if (forCamera) {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) return { granted: false, message: "Camera permission denied. Enable in settings." };
  }
  const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!lib.granted) return { granted: false, message: "Gallery permission denied. Enable in settings." };
  return { granted: true };
}

export async function pickImageFromGallery(): Promise<{ uri: string | null; cancelled: boolean; error?: string }> {
  const perm = await ensurePermissions(false);
  if (!perm.granted) return { uri: null, cancelled: false, error: perm.message };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled) return { uri: null, cancelled: true };
  return { uri: result.assets[0].uri, cancelled: false };
}

export async function takePhotoWithCamera(): Promise<{ uri: string | null; cancelled: boolean; error?: string }> {
  const perm = await ensurePermissions(true);
  if (!perm.granted) return { uri: null, cancelled: false, error: perm.message };

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled) return { uri: null, cancelled: true };
  return { uri: result.assets[0].uri, cancelled: false };
}

export async function compressToProfilePicture(
  uri: string,
  maxBytes = 190 * 1024
): Promise<{ base64: string; size: number }> {
  // Try quality ladder 0.9 -> 0.7 -> 0.5 -> 0.3 and resize to 512
  const qualities = [0.9, 0.7, 0.5, 0.35, 0.2];
  let best: { base64: string; size: number } | null = null;

  for (const q of qualities) {
    const manip = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512, height: 512 } }],
      { compress: q, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!manip.base64) continue;
    const dataUrl = `data:image/jpeg;base64,${manip.base64}`;
    const size = dataUrl.length;
    best = { base64: dataUrl, size };
    if (size < maxBytes) return best;
    // otherwise try lower quality
  }
  if (best) {
    // Even if still over limit, return smallest (will be rejected by backend with clear code)
    return best;
  }
  throw new Error("Failed to compress image");
}
