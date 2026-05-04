import { useEffect, useState } from "react";

const PASSWORD = "igoferro@";

export default function DevAccessBlocker() {
  const [disabledUntil, setDisabledUntil] = useState<number>(0);

  useEffect(() => {
    const tryUnlock = () => {
      try {
        const input = window.prompt("Ação restrita. Insira a senha para liberar por 10s:");
        if (input === PASSWORD) {
          setDisabledUntil(Date.now() + 10000);
          // breve feedback
          try {
            window.alert("Acesso liberado por 10 segundos.");
          } catch {}
        } else {
          try {
            if (input !== null) window.alert("Senha incorreta.");
          } catch {}
        }
      } catch (err) {
        console.error("Unlock prompt failed", err);
      }
    };

    const onContext = (e: MouseEvent) => {
      if (Date.now() < disabledUntil) return; // temporariamente liberado
      e.preventDefault();
      tryUnlock();
    };

    const onKey = (e: KeyboardEvent) => {
      const key = e.key || "";
      const k = key.toLowerCase();
      const isDevShortcut =
        key === "F12" ||
        (e.ctrlKey && e.shiftKey && (k === "i" || k === "j")) ||
        (e.ctrlKey && k === "u") ||
        (e.metaKey && e.altKey && k === "i");

      if (!isDevShortcut) return;
      if (Date.now() < disabledUntil) return;
      e.preventDefault();
      tryUnlock();
    };

    document.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [disabledUntil]);

  return null;
}
