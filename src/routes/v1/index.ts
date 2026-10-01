import express, { type Router } from 'express';
import config from '../../config/index.ts';
import authRoute from './auth.route.ts';
import employeesRoute from './employees.route.ts';
import proceduresRoute from './procedures.route.ts';
import categoriesRoute from './categories.route.ts';
import uploadsRoute from './uploads.route.ts';
import jobsRoute from './jobs.route.ts';

const router: Router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/categories',
    route: categoriesRoute,
  },
  {
    path: '/procedures',
    route: proceduresRoute,
  },
  {
    path: '/employees',
    route: employeesRoute,
  },
  {
    path: '/uploads',
    route: uploadsRoute,
  },
  {
    path: '/jobs',
    route: jobsRoute,
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
