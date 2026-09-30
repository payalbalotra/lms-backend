import express, { type Router } from 'express';
import config from '../../config/index.ts';
import authRoute from './auth.route.ts';
import employeesRoute from './employees.route.ts';
import libraryRoute, { proceduresPublicRoute } from './library.route.ts';
import uploadsRoute from './uploads.route.ts';

const router: Router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/procedures',
    route: proceduresPublicRoute,
  },
  {
    path: '/employees',
    route: employeesRoute,
  },
  {
    path: '/library',
    route: libraryRoute,
  },
  {
    path: '/uploads',
    route: uploadsRoute,
  },
];

const devRoutes: { path: string; route: Router }[] = [
  // Add any development-only routes here in the future
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

export default router;
