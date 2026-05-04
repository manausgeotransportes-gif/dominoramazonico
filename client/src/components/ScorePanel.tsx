import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";


export interface ScorePanelHandle {
  getPoints: () => number;
  resetPoints: () => void;
  resetGalo: () => void;
}

interface ScorePanelProps {
  roomId: number;
  onSendAction?: (action: "galo" | "passei") => void;
  onPointsChange?: (points: number) => void;
}


export const ScorePanel = forwardRef<ScorePanelHandle, ScorePanelProps>(({ roomId, onSendAction, onPointsChange }, ref) => {
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<null | 'galo' | 'passei'>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const sendActionMutation = trpc.score.sendAction.useMutation();

  // Limpar erro após 5 segundos
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useImperativeHandle(ref, () => ({
    getPoints: () => points,
    resetPoints: () => {
      setPoints(0);
      onPointsChange?.(0);
    },
    resetGalo: () => setModal(null),
  }), [points, onPointsChange]);

  const handlePointsChange = (delta: number) => {
    setPoints((prev) => {
      const next = Math.max(0, prev + delta);
      onPointsChange?.(next);
      return next;
    });
  };

  const handleGalo = useCallback(() => {
    setModal('galo');
    setError(null);
  }, []);

  const handlePassei = useCallback(() => {
    setModal('passei');
    setError(null);
  }, []);

  const confirmGalo = useCallback(async () => {
    setLoading(true);
    setModal(null);
    setError(null);
    onSendAction?.("galo");
    try {
      const result = await sendActionMutation.mutateAsync({ roomId, action: "galo" });
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["score", "getScore"] });
        queryClient.invalidateQueries({ queryKey: ["ranking", "getPlayerRanking"] });
      }
    } catch {
      // A mesa local recebe o GALO pelo iframe; não exibimos erro aqui.
    } finally {
      setLoading(false);
    }
  }, [roomId, sendActionMutation, onSendAction, queryClient]);

  const confirmPassei = useCallback(async () => {
    setLoading(true);
    setModal(null);
    setError(null);
    onSendAction?.("passei");
    try {
      const result = await sendActionMutation.mutateAsync({ roomId, action: "passei" });
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["score", "getScore"] });
        queryClient.invalidateQueries({ queryKey: ["ranking", "getPlayerRanking"] });
      }
    } catch {
      // A mesa local recebe o PASSE pelo iframe; não exibimos erro aqui.
    } finally {
      setLoading(false);
    }
  }, [roomId, sendActionMutation, onSendAction, queryClient]);

    // O envio dos pontos será feito automaticamente ao jogar a pedra, conforme a regra.


  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 200, display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      <input
        type="text"
        value={points}
        onChange={(e) => {
          const next = Number(e.target.value) || 0;
          setPoints(next);
          onPointsChange?.(next);
        }}
        style={{ textAlign: "center", fontSize: 22, width: 38, height: 32, border: "none", background: "#222", color: "#fff", fontWeight: 900, marginBottom: 0 }}
        maxLength={2}
        pattern="[0-9]*"
        inputMode="numeric"
        autoComplete="off"
        disabled={loading}
      />
      <Button variant="default" onClick={() => handlePointsChange(-5)} disabled={loading}>-5</Button>
      <Button variant="default" onClick={() => handlePointsChange(5)} disabled={loading}>+5</Button>
      <Button
        variant={modal === 'galo' ? "secondary" : "destructive"}
        style={modal === 'galo' ? { border: "2px solid #f59e0b", background: "#fffbe6", color: "#b45309" } : {}}
        onClick={handleGalo}
        disabled={loading}
      >{loading ? "..." : "🐓 GALO"}</Button>
      <Button
        variant={modal === 'passei' ? "secondary" : "destructive"}
        style={modal === 'passei' ? { border: "2px solid #ef4444", background: "#fff1f2", color: "#991b1b" } : {}}
        onClick={handlePassei}
        disabled={loading}
      >{loading ? "..." : "PASSEI"}</Button>

      {modal === 'galo' && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.35)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 4px 32px #0003', minWidth: 320, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Tem certeza que deseja anunciar GALO?</div>
            <div style={{ color: '#b45309', marginBottom: 24 }}>Se for válido, você ganha +50 pontos e joga novamente.</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <Button variant="destructive" onClick={() => setModal(null)}>Desistir</Button>
              <Button variant="secondary" onClick={confirmGalo}>Continuar</Button>
            </div>
          </div>
        </div>
      )}
      {modal === 'passei' && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.35)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 4px 32px #0003', minWidth: 320, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Tem certeza que não tem pedras para jogar?</div>
            <div style={{ color: '#991b1b', marginBottom: 24 }}>Se confirmar, 20 pontos vão para a equipe adversária.</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <Button variant="destructive" onClick={() => setModal(null)}>Desistir</Button>
              <Button variant="secondary" onClick={confirmPassei}>Continuar</Button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 12px", marginTop: 8, fontWeight: 500, fontSize: 15, minWidth: 220, maxWidth: 400, wordWrap: "break-word" }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
});
