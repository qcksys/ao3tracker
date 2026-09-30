import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".dev.vars" });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error({
    message: "Environment variable validation failed",
    errors: parsed.error.flatten().fieldErrors,
  });
  throw new Error("Missing required environment variables");
}
