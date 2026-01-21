import { SESv2Client } from '@aws-sdk/client-sesv2';

let cached: SESv2Client | null = null;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getSesClient(): SESv2Client {
  if (cached) return cached;

  const region = process.env.SES_AWS_REGION || 'us-east-1';
  const accessKeyId = requiredEnv('SES_AWS_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('SES_AWS_SECRET_ACCESS_KEY');

  cached = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
}

