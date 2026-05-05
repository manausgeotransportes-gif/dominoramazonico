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
function Router() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  if (/^\/game\/[^/?#]+\/?$/.test(pathname)) {
    return <GamePage />;
  }

  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/lobby"} component={Lobby} />
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
