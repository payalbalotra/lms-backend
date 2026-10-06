import express, { type Router } from 'express';
import * as locationsController from '../../controllers/v1/locations.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const locationsRoute: Router = express.Router();
locationsRoute.use(requireAuth, requireAdmin);

locationsRoute.get('/', locationsController.listLocations);
locationsRoute.post('/', locationsController.createLocation);
locationsRoute.patch('/:id', locationsController.updateLocation);
locationsRoute.delete('/:id', locationsController.deleteLocation);

export default locationsRoute;
