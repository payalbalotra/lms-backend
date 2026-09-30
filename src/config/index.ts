import 'dotenv/config';
import { z } from 'zod';

const envVarsSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().default(8000),
  ),
  DATABASE_URL: z.string(),
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string().optional(),
  FRONTEND_BASE_URL: z.string().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().optional(),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  R2_UPLOAD_TTL_SECONDS: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().default(600),
  ),
  R2_UPLOAD_MAX_BYTES: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().default(10485760),
  ),

  // AI extraction
  GOOGLE_AI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
});

const response = envVarsSchema.safeParse(process.env);

if (!response.success) {
  // Name the offending variable in every issue. Without the path, a container
  // that is missing its whole environment just repeats "expected string,
  // received undefined" once per variable, which says nothing about which.
  const issues = response.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    return issue.code === 'invalid_type' && issue.input === undefined
      ? `${name} is missing`
      : `${name}: ${issue.message}`;
  });

  throw new Error(`Config validation error: ${issues.join(', ')}`);
}

const envVars = response.data;

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  betterAuthSecret: envVars.BETTER_AUTH_SECRET,
  betterAuthUrl: envVars.BETTER_AUTH_URL,
  cors: [envVars.FRONTEND_BASE_URL],
  frontendBaseUrl: envVars.FRONTEND_BASE_URL,
  resendApiKey: envVars.RESEND_API_KEY,
  r2AccountId: envVars.R2_ACCOUNT_ID,
  r2Endpoint: envVars.R2_ENDPOINT,
  r2AccessKeyId: envVars.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: envVars.R2_SECRET_ACCESS_KEY,
  r2Bucket: envVars.R2_BUCKET,
  r2PublicBaseUrl: envVars.R2_PUBLIC_BASE_URL,
  r2UploadTtlSeconds: envVars.R2_UPLOAD_TTL_SECONDS,
  r2UploadMaxBytes: envVars.R2_UPLOAD_MAX_BYTES,
  googleAiApiKey: envVars.GOOGLE_AI_API_KEY,
  geminiModel: envVars.GEMINI_MODEL,
};

export default config;
