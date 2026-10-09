import express, { type Router } from 'express';
import * as stationsController from './stations.controller.ts';
import { requireAuth } from '../../middleware/require-auth.ts';
import { requireRoles } from '../../middleware/require-roles.ts';
import { createLimiter } from '../../middleware/rate-limit.ts';

const stationsRoute: Router = express.Router();
stationsRoute.use(requireAuth, requireRoles(['super_admin']));

stationsRoute.get('/', stationsController.listStations);

stationsRoute.post(
  '/',
  createLimiter({
    limit: 20,
    message: 'Too many stations created, please try again later.',
  }),
  stationsController.createStation,
);

stationsRoute.patch(
  '/:id',
  createLimiter({
    limit: 30,
    message: 'Too many station updates, please try again later.',
  }),
  stationsController.updateStation,
);

stationsRoute.delete(
  '/:id',
  createLimiter({
    limit: 20,
    message: 'Too many station deletions, please try again later.',
  }),
  stationsController.deleteStation,
);

export default stationsRoute;
