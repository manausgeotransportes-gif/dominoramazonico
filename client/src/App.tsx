import GamePage from "./pages/GamePage";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DevAccessBlocker from "./components/DevAccessBlocker";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Ranking from "./pages/Ranking";
import AdminPanel from "./pages/AdminPanel";
import Friends from "./pages/Friends";
import Agenda from "./pages/Agenda";
import { useEffect } from "react";

function useLogoutOnPageExit() {
  useEffect(() => {
    const logoutOnPageExit = () => {
      // If we set this flag (e.g. during login) skip performing logout on reload
      try {
        const skip = window.localStorage.getItem("manus-skip-logout-on-reload");
        if (skip) {
          window.localStorage.removeItem("manus-skip-logout-on-reload");
          return;
        }
      } catch {}
      const localUserId = window.localStorage.getItem("domino_local_user_id");
      const cachedUser = window.localStorage.getItem("manus-runtime-user-info");
      if (!localUserId && (!cachedUser || cachedUser === "null")) return;

      const headers: Record<string, string> = { "content-type": "application/json" };
      if (localUserId) headers["x-local-user-id"] = localUserId;

      try {
        window.localStorage.removeItem("domino_local_user_id");
        window.localStorage.removeItem("manus-runtime-user-info");
      } catch {}

      fetch("/api/trpc/auth.logout", {
        method: "POST",
        headers,
        body: JSON.stringify({ json: null }),
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("pagehide", logoutOnPageExit);
    return () => window.removeEventListener("pagehide", logoutOnPageExit);
  }, []);
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/lobby"} component={Lobby} />
      <Route path={"/game/:gameId"} component={GamePage} />
      <Route path={/^\/game\/([^/]+)\/?$/} component={GamePage} />
      <Route path={"/ranking"} component={Ranking} />
      <Route path={"/friends"} component={Friends} />
      <Route path={"/agenda"} component={Agenda} />
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useLogoutOnPageExit();

  return (
    <ErrorBoundary>
      <div className="notranslate" translate="no">
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <DevAccessBlocker />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </div>
    </ErrorBoundary>
  );
}

export default App;
