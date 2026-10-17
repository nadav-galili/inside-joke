import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFile } from 'node:fs/promises';

/** Where faces and finished videos live. R2 in production; anything S3-compatible works. */
export type Storage = {
  /** A short-lived URL a provider such as fal can fetch the object from. */
  readUrl(key: string, expiresInSeconds?: number): Promise<string>;
  uploadFile(key: string, file: string, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every object under a prefix, with when it was written. */
  list(prefix: string): AsyncIterable<{ key: string; modifiedAt: Date }>;
};

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function r2Storage(config: R2Config): Storage {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    readUrl: (key, expiresInSeconds = 3600) =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      }),
    uploadFile: async (key, file, contentType) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: await readFile(file),
          ContentType: contentType,
        }),
      );
    },
    remove: async (key) => {
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    async *list(prefix) {
      let token: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const o of page.Contents ?? []) {
          if (o.Key && o.LastModified) yield { key: o.Key, modifiedAt: o.LastModified };
        }
        token = page.NextContinuationToken;
      } while (token);
    },
  };
}

/** The R2 key of a finished video. */
export const videoKey = (videoId: string) => `videos/${videoId}.mp4`;
