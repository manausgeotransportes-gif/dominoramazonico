import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

const QUICK_MESSAGES = [
  "Bom jogo!",
  "Boa sorte!",
  "Bem jogado!",
  "Valeu!",
  "Jogue rápido!",
  "Boa rodada!",
];

interface Message {
  id: number;
  userId: number;
  userName: string;
  message: string;
  isOffensive: boolean;
  createdAt: Date;
}

interface GameChatProps {
  gameId: number;
}

export function GameChat({ gameId }: GameChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: chatMessages, refetch: refetchMessages } = trpc.chat.getMessages.useQuery(gameId, { refetchInterval: 2000 });
  const { data: blockStatus } = trpc.chat.checkBlockStatus.useQuery();

  // Mutations
  const { mutate: sendMessage, isPending } = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setInputValue("");
      refetchMessages();
    },
    onError: (error) => {
      if (error.message.includes("bloqueado")) {
        setIsBlocked(true);
      }
      if (error.message) {
        console.warn(error.message);
      }
    },
  });

  // Estado para controle de spam
  const [lastMessages, setLastMessages] = useState<string[]>([]);
  const [spamWarning, setSpamWarning] = useState("");

  // Atualizar mensagens
  useEffect(() => {
    if (chatMessages) {
      setMessages(
        chatMessages.map((msg: any) => ({
          ...msg,
          createdAt: new Date(msg.createdAt),
        }))
      );
    }
  }, [chatMessages]);

  // Atualizar status de bloqueio
  useEffect(() => {
    if (blockStatus) {
      setIsBlocked(blockStatus.isBlocked);
    }
  }, [blockStatus]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = (msg?: string) => {
    const value = typeof msg === "string" ? msg : inputValue;
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed || trimmed.length > 100 || !user) return;

    // Checagem de spam (3 mensagens iguais seguidas)
    const newLastMessages = [...lastMessages, trimmed].slice(-3);
    setLastMessages(newLastMessages);
    if (newLastMessages.length === 3 && newLastMessages.every((m) => m === trimmed)) {
      setSpamWarning("Não envie spam: mensagem repetida.");
      return;
    } else {
      setSpamWarning("");
    }

    sendMessage({
      gameId,
      message: trimmed,
    });
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="bg-transparent border-none shadow-none h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-sm">Chat da Partida</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 p-0 px-4">
        {/* Mensagens */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-2">
            {messages.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhuma mensagem ainda</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 font-semibold flex-shrink-0">{msg.userName}:</span>
                    <div className="flex-1">
                      {msg.isOffensive ? (
                        <div className="flex items-center gap-1 text-red-400 bg-red-900/20 px-2 py-1 rounded">
                          <AlertCircle className="w-3 h-3" />
                          <span className="text-xs">Mensagem removida (conteúdo ofensivo)</span>
                        </div>
                      ) : (
                        <span className="text-slate-200">{msg.message}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 ml-12">{msg.createdAt.toLocaleTimeString()}</span>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Status de bloqueio */}
        {isBlocked && (
          <div className="bg-red-900/20 border border-red-500/30 rounded p-2 text-xs text-red-300">
            <p className="font-semibold mb-1">⚠️ Você está bloqueado</p>
            <p>{blockStatus?.blockReason || "Bloqueado por infrações"}</p>
          </div>
        )}
        {spamWarning && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-2 text-xs text-yellow-300">
            <p className="font-semibold mb-1">⚠️ {spamWarning}</p>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 pb-4">
          <Select onValueChange={v => { setInputValue(v); if (v) handleSendMessage(v); }}>
            <SelectTrigger className="flex-1 min-w-[180px] bg-background/50 border border-border text-white">
              <SelectValue placeholder="Mensagem rápida" />
            </SelectTrigger>
            <SelectContent>
              {QUICK_MESSAGES.map((msg, idx) => (
                <SelectItem key={idx} value={msg}>{msg}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isBlocked ? "Você está bloqueado..." : "Digite sua mensagem..."}
            disabled={isBlocked || isPending}
            maxLength={100}
            className="bg-background/50 border border-border text-white placeholder-slate-400 text-sm flex-1"
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={isBlocked || isPending || !inputValue.trim()}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
