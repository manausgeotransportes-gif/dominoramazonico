// Contrato de perfil profissional
export interface PlayerProfile {
  displayName: string;
  avatarType: "preset" | "upload";
  avatarPresetId?: string;
  avatarUrl?: string;
  preferredVisualMode?: "light" | "dark";
}
