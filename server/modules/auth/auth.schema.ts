import { z } from "zod";

// Input para login/cadastro profissional
export const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
  displayName: z.string().min(2).max(60),
  avatarPreset: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});
