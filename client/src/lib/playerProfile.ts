export type PlayerAvatarPreset = {
  id: string;
  label: string;
  src: string;
};

export type StoredPlayerProfile = {
  displayName?: string;
  avatarType?: "preset" | "upload";
  avatarPresetId?: string;
  avatarImage?: string | null;
};

const STORAGE_KEY = "domino_player_profile";

type AvatarMotif = "leaf" | "river" | "sun" | "moon" | "crown" | "star" | "diamond" | "spark";

function buildAvatarSvg(label: string, colors: [string, string], accent: string, detail: string = "#ffffff", motif: AvatarMotif = "leaf") {
  const initials = label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const motifSvg: Record<AvatarMotif, string> = {
    leaf: `<path d="M118 30c-23 2-38 15-42 36 23 0 39-13 42-36Z" fill="${detail}" opacity="0.18"/><path d="M78 67c12-13 24-22 39-32" stroke="${detail}" stroke-width="4" stroke-linecap="round" opacity="0.35"/>`,
    river: `<path d="M18 44c21-14 42 14 63 0s42-14 63 0" fill="none" stroke="${detail}" stroke-width="8" stroke-linecap="round" opacity="0.2"/><path d="M14 66c24-14 44 13 66 0s43-14 66 0" fill="none" stroke="${detail}" stroke-width="5" stroke-linecap="round" opacity="0.18"/>`,
    sun: `<circle cx="122" cy="38" r="19" fill="${detail}" opacity="0.2"/><path d="M122 10v11M122 55v11M94 38h11M139 38h11M102 18l8 8M134 50l8 8M142 18l-8 8M110 50l-8 8" stroke="${detail}" stroke-width="4" stroke-linecap="round" opacity="0.28"/>`,
    moon: `<path d="M128 22c-16 8-22 28-12 43 4 6 10 10 16 12-18 7-39-1-48-18-10-20-2-44 18-54 9-4 18-5 26-3Z" fill="${detail}" opacity="0.2"/>`,
    crown: `<path d="M45 54 63 34l17 22 18-22 17 20-5 25H50Z" fill="${detail}" opacity="0.2"/><path d="M51 79h58" stroke="${detail}" stroke-width="6" stroke-linecap="round" opacity="0.28"/>`,
    star: `<path d="m123 18 8 18 19 2-14 13 4 19-17-10-17 10 4-19-14-13 19-2Z" fill="${detail}" opacity="0.2"/>`,
    diamond: `<path d="M121 18 147 47l-26 31-26-31Z" fill="${detail}" opacity="0.19"/><path d="M95 47h52M121 18l-9 29 9 31 9-31Z" fill="none" stroke="${detail}" stroke-width="3" opacity="0.18"/>`,
    spark: `<path d="M122 16c4 16 11 24 27 28-16 4-23 12-27 28-5-16-12-24-28-28 16-4 23-12 28-28Z" fill="${detail}" opacity="0.19"/><circle cx="34" cy="35" r="7" fill="${detail}" opacity="0.14"/>`,
  };

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="100%" stop-color="${colors[1]}" />
        </linearGradient>
        <radialGradient id="shine" cx="35%" cy="20%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#g)" />
      <rect width="160" height="160" rx="34" fill="url(#shine)" />
      <circle cx="27" cy="124" r="38" fill="#000000" opacity="0.12" />
      ${motifSvg[motif]}
      <path d="M31 143c8-33 25-51 49-51s41 18 49 51" fill="#0f172a" opacity="0.35" />
      <path d="M38 140c8-28 23-43 42-43s34 15 42 43" fill="${accent}" opacity="0.96" />
      <path d="M48 107c8 12 19 18 32 18s24-6 32-18" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.18" />
      <circle cx="80" cy="62" r="31" fill="#f4c9a1" />
      <path d="M50 56c4-25 21-38 43-32 11 3 20 11 23 23-15-7-30-9-44-5-9 3-16 8-22 14Z" fill="#1f2937" opacity="0.9" />
      <circle cx="68" cy="65" r="3.5" fill="#172033" />
      <circle cx="92" cy="65" r="3.5" fill="#172033" />
      <path d="M70 78c6 6 14 6 20 0" fill="none" stroke="#7c2d12" stroke-width="3.5" stroke-linecap="round" opacity="0.7" />
      <circle cx="80" cy="80" r="58" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="5" />
      <text x="80" y="149" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="18" font-weight="800">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const PLAYER_AVATAR_PRESETS: PlayerAvatarPreset[] = [
  { id: "avatar_player", label: "Guardião", src: "/domino-mesa/assets/avatars/player.svg" },
  { id: "avatar_aru", label: "Aru", src: "/domino-mesa/assets/avatars/aru.svg" },
  { id: "avatar_boto", label: "Boto", src: "/domino-mesa/assets/avatars/boto.svg" },
  { id: "avatar_iara", label: "Iara", src: "/domino-mesa/assets/avatars/iara.svg" },
  { id: "avatar_onca", label: "Onça", src: "/domino-mesa/assets/avatars/onca.svg" },
  { id: "avatar_arara", label: "Arara", src: "/domino-mesa/assets/avatars/arara.svg" },
  { id: "avatar_curupira", label: "Curupira", src: "/domino-mesa/assets/avatars/curupira.svg" },
  { id: "avatar_tucano", label: "Tucano", src: "/domino-mesa/assets/avatars/tucano.svg" },
];

const LEGACY_AVATAR_MAP: Record<string, string> = {
  guardiao: "avatar_player",
  amazonia: "avatar_aru",
  noite: "avatar_boto",
  ouro: "avatar_iara",
  oceano: "avatar_onca",
  brasa: "avatar_arara",
  aurora: "avatar_curupira",
  jade_real: "avatar_tucano",
};

export function normalizeAvatarPresetId(id?: string | null) {
  const mapped = id ? LEGACY_AVATAR_MAP[id] ?? id : null;
  return PLAYER_AVATAR_PRESETS.some((preset) => preset.id === mapped) ? mapped! : PLAYER_AVATAR_PRESETS[0].id;
}

export function getDefaultPlayerProfile(): StoredPlayerProfile {
  return {
    displayName: "",
    avatarType: "preset",
    avatarPresetId: PLAYER_AVATAR_PRESETS[0].id,
    avatarImage: null,
  };
}

export function loadPlayerProfile(): StoredPlayerProfile {
  if (typeof window === "undefined") return getDefaultPlayerProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPlayerProfile();
    const profile = { ...getDefaultPlayerProfile(), ...JSON.parse(raw) };
    return { ...profile, avatarPresetId: normalizeAvatarPresetId(profile.avatarPresetId) };
  } catch {
    return getDefaultPlayerProfile();
  }
}

export function savePlayerProfile(profile: StoredPlayerProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getDefaultPlayerProfile(), ...profile, avatarPresetId: normalizeAvatarPresetId(profile.avatarPresetId) }));
}

export function profileFromUser(user?: {
  displayName?: string | null;
  avatarType?: "preset" | "upload" | null;
  avatarPresetId?: string | null;
  avatarImage?: string | null;
  name?: string | null;
} | null): StoredPlayerProfile {
  if (!user) return loadPlayerProfile();
  const localProfile = loadPlayerProfile();

  return {
    displayName: user.displayName || user.name || "",
    avatarType: user.avatarType ?? localProfile.avatarType ?? "preset",
    avatarPresetId: normalizeAvatarPresetId(user.avatarPresetId || localProfile.avatarPresetId),
    avatarImage: user.avatarImage ?? localProfile.avatarImage ?? null,
  };
}

export function resolvePlayerAvatar(profile?: StoredPlayerProfile | null) {
  const data = profile ?? loadPlayerProfile();
  if (data.avatarType === "upload" && data.avatarImage) return data.avatarImage;
  const preset = PLAYER_AVATAR_PRESETS.find((item) => item.id === normalizeAvatarPresetId(data.avatarPresetId)) ?? PLAYER_AVATAR_PRESETS[0];
  return preset.src;
}

export function getCompetitiveTier(totalPoints: number) {
  if (totalPoints >= 120) return { label: "Lenda da Mesa", tone: "text-amber-300", surface: "bg-amber-500/10 border-amber-400/30" };
  if (totalPoints >= 70) return { label: "Craque", tone: "text-emerald-300", surface: "bg-emerald-500/10 border-emerald-400/30" };
  if (totalPoints >= 30) return { label: "Bom jogador", tone: "text-sky-300", surface: "bg-sky-500/10 border-sky-400/30" };
  if (totalPoints >= 10) return { label: "Em evolução", tone: "text-violet-300", surface: "bg-violet-500/10 border-violet-400/30" };
  return { label: "Iniciante", tone: "text-slate-300", surface: "bg-white/5 border-white/10" };
}
