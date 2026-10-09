import express, { type Router } from 'express';
import * as locationsController from './locations.controller.ts';
import { requireAuth } from '../../middleware/require-auth.ts';
import { requireRoles } from '../../middleware/require-roles.ts';
import { createLimiter } from '../../middleware/rate-limit.ts';

const locationsRoute: Router = express.Router();
locationsRoute.use(requireAuth, requireRoles(['super_admin']));

locationsRoute.get('/', locationsController.listLocations);

locationsRoute.post(
  '/',
  createLimiter({
    limit: 20,
    message: 'Too many locations created, please try again later.',
  }),
  locationsController.createLocation,
);

locationsRoute.patch(
  '/:id',
  createLimiter({
    limit: 30,
    message: 'Too many location updates, please try again later.',
  }),
  locationsController.updateLocation,
);

locationsRoute.delete(
  '/:id',
  createLimiter({
    limit: 20,
    message: 'Too many location deletions, please try again later.',
  }),
  locationsController.deleteLocation,
);

export default locationsRoute;
