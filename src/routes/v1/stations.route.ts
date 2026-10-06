import express, { type Router } from 'express';
import * as stationsController from '../../controllers/v1/stations.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const stationsRoute: Router = express.Router();
stationsRoute.use(requireAuth, requireAdmin);

stationsRoute.get('/', stationsController.listStations);
stationsRoute.post('/', stationsController.createStation);
stationsRoute.patch('/:id', stationsController.updateStation);
stationsRoute.delete('/:id', stationsController.deleteStation);

export default stationsRoute;
