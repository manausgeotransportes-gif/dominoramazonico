import { PlayerProfile } from "@shared/game/profile";

// Exemplo de payload de visual settings para o iframe
export interface VisualSettingsPayload {
  visualMode: PlayerProfile["preferredVisualMode"];
  tileTheme?: string;
  tableTheme?: string;
}

export function sendVisualSettingsToIframe(
  iframeRef: React.RefObject<HTMLIFrameElement>,
  userProfile: PlayerProfile & { tileTheme?: string; tableTheme?: string }
) {
  iframeRef.current?.contentWindow?.postMessage({
    type: "visual-settings",
    payload: {
      visualMode: userProfile.preferredVisualMode,
      tileTheme: userProfile.tileTheme,
      tableTheme: userProfile.tableTheme,
    },
  }, "*");
}
