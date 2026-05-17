import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const REQUIRED_ENV = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

let client;

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, '');
}

export function getS3ConfigError() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return `Не настроено S3-хранилище: добавьте ${missing.join(', ')}`;
  }
  return null;
}

function getClient() {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export function getPublicUrl(key) {
  const publicBaseUrl = trimTrailingSlash(process.env.S3_PUBLIC_BASE_URL);
  if (publicBaseUrl) return `${publicBaseUrl}/${key}`;

  const endpoint = trimTrailingSlash(process.env.S3_ENDPOINT);
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) return '';

  return `${endpoint}/${bucket}/${key}`;
}

export async function uploadChatMedia({ key, body, contentType }) {
  const configError = getS3ConfigError();
  if (configError) {
    throw new Error(configError);
  }

  await getClient().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return getPublicUrl(key);
}
