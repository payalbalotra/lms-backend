import express, { type Router } from 'express';
import config from './config/env.ts';
import authRoute from './modules/auth/auth.routes.ts';
import employeesRoute from './modules/employees/employees.routes.ts';
import proceduresRoute from './modules/procedures/procedures.routes.ts';
import uploadsRoute from './modules/uploads/uploads.routes.ts';
import stationsRoute from './modules/stations/stations.routes.ts';
import locationsRoute from './modules/locations/locations.routes.ts';
import jobsRoute from './modules/jobs/jobs.routes.ts';
import categoriesRoute from './modules/categories/categories.routes.ts';
import quizzesRoute from './modules/quizzes/quizzes.routes.ts';

const router: Router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
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
    path: '/stations',
    route: stationsRoute,
  },
  {
    path: '/locations',
    route: locationsRoute,
  },
  {
    path: '/jobs',
    route: jobsRoute,
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
    path: '/quizzes',
    route: quizzesRoute,
  },
];

const devRoutes: { path: string; route: Router }[] = [];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

export default router;
