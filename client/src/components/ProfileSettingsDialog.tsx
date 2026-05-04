import { useMemo, useState } from "react";
import { Camera, Check, LogOut, Settings2, Sparkles } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PLAYER_AVATAR_PRESETS, StoredPlayerProfile, resolvePlayerAvatar } from "@/lib/playerProfile";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ProfileSettingsDialogProps = {
  profile: StoredPlayerProfile;
  onSave: (profile: StoredPlayerProfile) => void;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link";
  className?: string;
};

export default function ProfileSettingsDialog({
  profile,
  onSave,
  triggerLabel = "Configurações",
  triggerVariant = "outline",
  className,
}: ProfileSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(profile.displayName || "");
  const [draftPreset, setDraftPreset] = useState(profile.avatarPresetId || PLAYER_AVATAR_PRESETS[0].id);
  const [draftImage, setDraftImage] = useState<string | null>(profile.avatarType === "upload" ? profile.avatarImage || null : null);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const { logout } = useAuth();

  const preview = useMemo(() => {
    return draftImage || resolvePlayerAvatar({ avatarType: "preset", avatarPresetId: draftPreset });
  }, [draftImage, draftPreset]);

  const save = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        displayName: draftName,
        avatarType: draftImage ? "upload" : "preset",
        avatarPresetId: draftPreset,
        avatarImage: draftImage || undefined,
      });

      onSave({
        displayName: draftName,
        avatarType: draftImage ? "upload" : "preset",
        avatarPresetId: draftPreset,
        avatarImage: draftImage,
      });

      toast.success("Perfil atualizado com sucesso!");
      setOpen(false);
    } catch (error) {
      toast.error("Erro ao atualizar perfil");
      console.error("Profile update error:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={className}>
          <Settings2 className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-white/10 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="h-5 w-5 text-emerald-300" />
            Perfil do jogador
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Atualize seu nome visual, troque a foto e escolha entre novos avatares estilizados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[0.68fr_1.32fr]">
          <aside className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">Prévia</div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full bg-slate-900/80 p-1 ring-2 ring-white/15 sm:h-52 sm:w-52">
                <div className="h-full w-full overflow-hidden rounded-full bg-gradient-to-br from-slate-800 via-slate-900 to-black">
                  <img src={preview} alt="Prévia do avatar" className="h-full w-full object-cover" />
                </div>
              </div>
              <div className="mt-4 text-center text-lg font-extrabold">{draftName || "Jogador"}</div>
              <div className="mt-2 text-center text-sm text-slate-400">Avatar ou foto do perfil</div>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block text-sm font-semibold text-slate-300">Nome de exibição</label>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Ex.: Mestre do Rio Negro" className="border-white/10 bg-white/5 text-white" />
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
              <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
                <Camera className="h-4 w-4" />
                Enviar foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                      toast.error("Envie uma imagem JPG, PNG ou WEBP.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setDraftImage(typeof reader.result === "string" ? reader.result : null);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <div className="mt-2 text-center text-xs text-slate-500">Aceita JPG, PNG ou WEBP.</div>
              {draftImage && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 w-full text-slate-200 hover:bg-white/10 hover:text-white"
                  onClick={() => setDraftImage(null)}
                >
                  Remover foto enviada
                </Button>
              )}
            </div>
          </aside>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">Configurações</div>
            <div className="mt-5 flex flex-col items-stretch gap-3">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={save}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? "Salvando..." : "Salvar perfil"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={async () => {
                  try {
                    await logout();
                    const loginUrl = getLoginUrl();
                    if (loginUrl && loginUrl !== "#") {
                      window.location.href = loginUrl;
                      return;
                    }
                    // fallback: reload to show unauthenticated UI
                    window.location.reload();
                  } catch (e) {
                    console.error(e);
                    setOpen(false);
                  }
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logoff
              </Button>
            </div>
          </section>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">Modelos de avatares</div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {PLAYER_AVATAR_PRESETS.map((preset) => {
              const active = !draftImage && draftPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setDraftPreset(preset.id);
                    setDraftImage(null);
                  }}
                  className={`group relative flex flex-col items-stretch overflow-hidden rounded-2xl border transition ${active ? "border-emerald-400 bg-emerald-500/6 ring-2 ring-emerald-300/20" : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"}`}
                >
                  <div className="flex h-32 sm:h-40 items-center justify-center bg-slate-900/70 p-6">
                    <div className="h-full w-full overflow-hidden rounded-md flex items-center justify-center">
                      <img src={preset.src} alt={preset.label} className="h-full w-auto max-w-full object-contain drop-shadow-lg" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{preset.label}</div>
                      <div className="text-xs text-slate-400">Avatar</div>
                    </div>
                    {active && (
                      <div className="ml-2 flex items-center">
                        <Check className="h-5 w-5 text-emerald-300" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
