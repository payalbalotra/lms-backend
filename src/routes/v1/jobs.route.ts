import express, { type Router } from 'express';
import * as jobsController from '../../controllers/v1/jobs.controller.ts';
import { requireAuth } from '../../auth/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const jobsRoute: Router = express.Router();
jobsRoute.use(requireAuth, requireAdmin);

jobsRoute.get('/', jobsController.listJobs);
jobsRoute.post('/', jobsController.createJob);
jobsRoute.patch('/:id', jobsController.updateJob);
jobsRoute.delete('/:id', jobsController.deleteJob);

export default jobsRoute;
