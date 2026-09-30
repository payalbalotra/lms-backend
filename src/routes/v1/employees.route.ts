import express, { type Router } from 'express';
import * as employeesController from '../../controllers/v1/employees.controller.ts';
import { requireAuth } from '../../auth/middleware.ts';
import { requireAdmin } from '../../shared/middleware/requireAdmin.middleware.ts';

const employeesRoute: Router = express.Router();
employeesRoute.use(requireAuth, requireAdmin);

// All employee admin routes require auth + admin clearance.
// Applied via adminRoutes in routes/v1/index.ts.

// ---- Employees -------------------------------------------------------------
employeesRoute.get('/', employeesController.listEmployees);
employeesRoute.post('/create-employee', employeesController.createEmployee);
employeesRoute.post('/:id/invites', employeesController.resendInvite);
employeesRoute.post('/:id/deactivate', employeesController.deactivate);
employeesRoute.post('/:id/reactivate', employeesController.reactivate);

// ---- Stations --------------------------------------------------------------
employeesRoute.get('/stations', employeesController.listStations);
employeesRoute.post('/stations', employeesController.createStation);
employeesRoute.patch('/stations/:id', employeesController.updateStation);
employeesRoute.post(
  '/stations/:id/archive',
  employeesController.archiveStation,
);

// ---- Roles -----------------------------------------------------------------
employeesRoute.get('/roles', employeesController.listRoles);
employeesRoute.post('/roles', employeesController.createRole);
employeesRoute.patch('/roles/:id', employeesController.updateRole);
employeesRoute.delete('/roles/:id', employeesController.deleteRole);

// ---- Locations -------------------------------------------------------------
employeesRoute.get('/locations', employeesController.listLocations);
employeesRoute.post('/locations', employeesController.createLocation);
employeesRoute.patch('/locations/:id', employeesController.updateLocation);
employeesRoute.delete('/locations/:id', employeesController.deleteLocation);

export default employeesRoute;
