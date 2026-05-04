import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Dices,
  LockKeyhole,
  CircleUserRound,
  Mail,
  Eye,
  EyeOff,
} from "lucide-react";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  loadPlayerProfile,
  savePlayerProfile,
} from "@/lib/playerProfile";

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        type={isVisible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 border-white/10 bg-white/5 pr-12 text-white placeholder:text-slate-500 sm:h-12"
      />
      <button
        type="button"
        aria-label={isVisible ? "Ocultar senha" : "Visualizar senha"}
        onClick={() => setIsVisible((current) => !current)}
        className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Home() {
  const { loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [playerProfile, setPlayerProfile] = useState(loadPlayerProfile());

  useEffect(() => {
    const stored = loadPlayerProfile();
    setPlayerProfile(stored);
    setRegisterName(stored.displayName || "");
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/lobby");
    }
  }, [isAuthenticated, loading, navigate]);

  const persistProfile = (name?: string) => {
    const nextProfile = {
      ...playerProfile,
      displayName: name || registerName || playerProfile.displayName || "Jogador",
    };
    savePlayerProfile(nextProfile);
    setPlayerProfile(nextProfile);
  };

  const onAuthSuccess = (name: string, userId: number, message: string) => {
    persistProfile(name);
    localStorage.setItem("domino_local_user_id", String(userId));
    // Prevent pagehide logout when we purposely reload after login
    try {
      localStorage.setItem("manus-skip-logout-on-reload", "1");
    } catch {}
    toast.success(message);
    navigate("/lobby");
    window.location.reload();
  };

  const registerPasswordMutation = trpc.auth.registerPassword.useMutation({
    onSuccess: ({ user }) => onAuthSuccess(user.name, user.id, "Conta criada com sucesso!"),
    onError: (error) => toast.error(error.message || "Não foi possível criar a conta"),
  });

  const loginPasswordMutation = trpc.auth.loginPassword.useMutation({
    onSuccess: ({ user }) => onAuthSuccess(user.name, user.id, `Olá novamente, ${user.name}!`),
    onError: (error) => toast.error(error.message || "Login ou senha inválidos"),
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 animate-spin" size={48} />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  const loginUrl = getLoginUrl();

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#123225_0%,#07110d_46%,#000000_100%)] px-4 py-4 text-white sm:px-6 sm:py-6">
        <main className="flex w-full max-w-md flex-col items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-400/10 shadow-[0_24px_70px_rgba(16,185,129,0.18)] sm:mb-3 sm:h-20 sm:w-20">
              <Dices className="h-9 w-9 text-emerald-200 sm:h-11 sm:w-11" />
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-normal sm:text-5xl">Dominó Amazônico</h1>
          </div>

          <Card className="w-full border-white/10 bg-slate-950/90 text-white shadow-2xl shadow-emerald-950/30 backdrop-blur">
            <CardContent className="p-4 sm:p-6">
              <Tabs defaultValue="login" className="gap-4 sm:gap-5">
                <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1">
                  <TabsTrigger value="login" className="rounded-lg text-white data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                    <LockKeyhole className="h-4 w-4" />
                    Entrar
                  </TabsTrigger>
                  <TabsTrigger value="cadastro" className="rounded-lg text-white data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                    <CircleUserRound className="h-4 w-4" />
                    Cadastro
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-3 sm:space-y-4">
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={loginEmail}
                    autoComplete="email"
                    onChange={(event) => setLoginEmail(event.target.value)}
                    className="h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-500 sm:h-12"
                  />
                  <PasswordInput
                    placeholder="Sua senha"
                    value={loginPassword}
                    autoComplete="current-password"
                    onChange={setLoginPassword}
                  />
                  <button
                    type="button"
                    onClick={() => toast.info("Recuperação de senha em breve. Por enquanto, fale com o administrador do jogo.")}
                    className="text-sm font-semibold text-emerald-200 transition hover:text-emerald-100"
                  >
                    Esqueceu a senha?
                  </button>
                  <Button
                    className="h-11 w-full bg-emerald-600 font-semibold hover:bg-emerald-700 sm:h-12"
                    onClick={() => loginPasswordMutation.mutate({ email: loginEmail, password: loginPassword })}
                  >
                    {loginPasswordMutation.isPending ? "Entrando..." : "Acessar conta"}
                  </Button>
                </TabsContent>

                <TabsContent value="cadastro" className="space-y-3 sm:space-y-4">
                  <Input
                    placeholder="Seu nome"
                    value={registerName}
                    autoComplete="name"
                    onChange={(event) => setRegisterName(event.target.value)}
                    className="h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-500 sm:h-12"
                  />
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={registerEmail}
                    autoComplete="email"
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    className="h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-500 sm:h-12"
                  />
                  <PasswordInput
                    placeholder="Crie uma senha"
                    value={registerPassword}
                    autoComplete="new-password"
                    onChange={setRegisterPassword}
                  />
                  <Button
                    className="h-11 w-full bg-emerald-600 font-semibold hover:bg-emerald-700 sm:h-12"
                    onClick={() => registerPasswordMutation.mutate({ name: registerName || "Jogador", email: registerEmail, password: registerPassword })}
                  >
                    {registerPasswordMutation.isPending ? "Criando conta..." : "Cadastrar e entrar"}
                  </Button>
                </TabsContent>
              </Tabs>

              {loginUrl !== "#" && (
                <div className="mt-4 border-t border-white/10 pt-4 sm:mt-5 sm:pt-5">
                  <a href={loginUrl} className="block">
                    <Button size="lg" className="h-11 w-full bg-white text-slate-900 hover:bg-slate-200 sm:h-12">
                      <Mail className="mr-2 h-4 w-4" />
                      Continuar com Google
                    </Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 animate-spin" size={48} />
        <p>Entrando no lobby...</p>
      </div>
    </div>
  );
}
