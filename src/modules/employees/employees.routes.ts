import express, { type Router } from 'express';
import * as employeesController from './employees.controller.ts';
import { requireAuth } from '../../middleware/require-auth.ts';
import { requireRoles } from '../../middleware/require-roles.ts';

const employeesRoute: Router = express.Router();
employeesRoute.use(requireAuth, requireRoles(['super_admin']));

// All employee admin routes require auth + admin clearance.
// Applied via adminRoutes in routes/v1/index.ts.

// ---- Employees -------------------------------------------------------------
employeesRoute.get('/', employeesController.listEmployees);
employeesRoute.get('/:id', employeesController.getEmployee);
employeesRoute.post('/', employeesController.createEmployee);
employeesRoute.put('/:id', employeesController.updateEmployee);
employeesRoute.post('/:id/invites', employeesController.resendInvite);
employeesRoute.post('/:id/deactivate', employeesController.deactivate);
employeesRoute.post('/:id/reactivate', employeesController.reactivate);

export default employeesRoute;
