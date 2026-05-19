import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { HomePage } from "./routes/HomePage";
import { GamePage } from "./routes/GamePage";
import { HistoryDetailPage } from "./routes/HistoryPage";
import { HistoryPage } from "./routes/HistoryPage";
import { SettingsPage } from "./routes/SettingsPage";
import { SpotifyCallbackPage } from "./routes/SpotifyCallbackPage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game",
  component: GamePage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

const historyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history/$gameId",
  component: () => {
    const { gameId } = historyDetailRoute.useParams();
    return <HistoryDetailPage gameId={gameId} />;
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const spotifyCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connectors/spotify/callback",
  component: SpotifyCallbackPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  gameRoute,
  historyRoute,
  historyDetailRoute,
  settingsRoute,
  spotifyCallbackRoute,
]);

export const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
