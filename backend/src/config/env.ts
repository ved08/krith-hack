import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export const env = EnvSchema.parse(process.env);
