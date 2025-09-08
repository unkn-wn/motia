import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import Home from './home';
import ProjectsList from '@components/ProjectsList';

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: Home,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsList,
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute, projectsRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
