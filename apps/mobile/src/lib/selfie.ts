import { File, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { UploadTarget } from '@insidejoke/shared';

/**
 * Opens the front camera for a new selfie. Only the camera, never the photo library: the face has
 * to be the person's own, taken now.
 */
export async function takeSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

/** Shrinks the photo to a 1024px JPEG (dropping its metadata) and uploads it to the signed link. */
export async function uploadSelfie(uri: string, target: UploadTarget): Promise<void> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: 1024 }).renderAsync();
  const jpeg = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const result = await new File(jpeg.uri).upload(target.uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'content-type': 'image/jpeg' },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`selfie upload failed: ${result.status}`);
  }
}
