import React from "react";

// Exemplo de card sofisticado de sala
export function RoomCard({ room }: { room: LobbyRoom }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-black text-white">{room.name}</div>
          <div className="text-sm text-slate-400">{room.currentPlayers}/4 jogadores</div>
        </div>
        <StatusBadge status={room.status} />
      </div>
      <div className="mt-4 flex gap-2">
        {room.players.map((player) => (
          <Avatar key={player.id} src={player.avatarUrl} alt={player.name} />
        ))}
      </div>
      <div className="mt-5">
        <Button className="w-full">Entrar</Button>
      </div>
    </div>
  );
}

// Tipos auxiliares (ajuste conforme necessário)
export interface LobbyRoom {
  name: string;
  currentPlayers: number;
  status: string;
  players: Array<{ id: number; avatarUrl: string; name: string }>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className="px-3 py-1 rounded-full bg-slate-700 text-xs">{status}</span>;
}
function Avatar({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="w-8 h-8 rounded-full border-2 border-white/20" />;
}
function Button({ children, className }: { children: React.ReactNode; className?: string }) {
  return <button className={"rounded-lg bg-green-600 hover:bg-green-700 text-white py-2 px-4 font-bold "+(className||"")}>{children}</button>;
}
