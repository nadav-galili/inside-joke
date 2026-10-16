import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** The API's view of R2: it hands out signed links and never streams faces or videos itself. */
export type Storage = {
  /** A signed PUT the device uploads a JPEG to directly. */
  uploadUrl(key: string): Promise<string>;
  readUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
};

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Signed links stay valid this long: enough to upload a selfie or watch and share a video. */
const LINK_SECONDS = 15 * 60;

export function r2Storage(config: R2Config): Storage {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;
  return {
    uploadUrl: (key) =>
      getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: 'image/jpeg' }), {
        expiresIn: LINK_SECONDS,
      }),
    readUrl: (key) =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: LINK_SECONDS }),
    exists: async (key) => {
      try {
        await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (e) {
        if ((e as { name?: string }).name === 'NotFound') return false;
        throw e;
      }
    },
    remove: async (key) => {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

/** Where a user's own selfie goes. The prefix ties an uploaded key to its owner. */
export const userSelfiePrefix = (userId: string) => `faces/users/${userId}/`;
/** Where a friend's selfie from the invite page goes, before they've become a member. */
export const joinSelfiePrefix = (groupId: string) => `faces/join/${groupId}/`;
export const newSelfieKey = (prefix: string) => `${prefix}${crypto.randomUUID()}.jpg`;
