import express, { type Router } from 'express';
import * as jobsController from '../../controllers/v1/jobs.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const jobsRoute: Router = express.Router();

// Public to any authenticated employee (used by employee creation form)
jobsRoute.get(
  '/with-stations',
  requireAuth,
  jobsController.listJobsWithStations,
);

// Returns stations for a specific job — used when the frontend
// fetches stations on-demand after the user selects a job.
jobsRoute.get('/:id/stations', requireAuth, jobsController.getJobStations);

// Admin-only routes
jobsRoute.use(requireAuth, requireAdmin);
jobsRoute.get('/', jobsController.listJobs);
jobsRoute.post('/', jobsController.createJob);
jobsRoute.patch('/:id', jobsController.updateJob);
jobsRoute.delete('/:id', jobsController.deleteJob);

export default jobsRoute;
