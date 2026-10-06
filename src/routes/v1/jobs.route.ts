import express, { type Router } from 'express';
import * as jobsController from '../../controllers/v1/jobs.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';
import { createLimiter } from '../../shared/middleware/rateLimit.middleware.ts';

const jobsRoute: Router = express.Router();

// Public to any authenticated employee (used by employee creation form)

// Returns stations for a specific job — used when the frontend
// fetches stations on-demand after the user selects a job.
// @ts-expect-error - 'query' is a new HTTP method, Express typings may not include it yet
jobsRoute.query('/stations', requireAuth, jobsController.getJobStations);

// Admin-only routes
jobsRoute.use(requireAuth, requireAdmin);
jobsRoute.get('/', jobsController.listJobs);

jobsRoute.post(
  '/',
  createLimiter({
    limit: 20,
    message: 'Too many jobs created, please try again later.',
  }),
  jobsController.createJob,
);

jobsRoute.patch(
  '/:id',
  createLimiter({
    limit: 30,
    message: 'Too many job updates, please try again later.',
  }),
  jobsController.updateJob,
);

jobsRoute.delete(
  '/:id',
  createLimiter({
    limit: 20,
    message: 'Too many job deletions, please try again later.',
  }),
  jobsController.deleteJob,
);

export default jobsRoute;
