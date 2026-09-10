import { Router } from 'express';
import * as adminEmployees from '../../controllers/admin/employees';

const router = Router();

// ---- Employees -------------------------------------------------------------
router.get('/', adminEmployees.listEmployees);
router.post('/', adminEmployees.createEmployee);
router.post('/:id/invites', adminEmployees.resendInvite);
router.post('/:id/deactivate', adminEmployees.deactivate);
router.post('/:id/reactivate', adminEmployees.reactivate);

// ---- Stations --------------------------------------------------------------
router.get('/stations', adminEmployees.listStations);
router.post('/stations', adminEmployees.createStation);
router.patch('/stations/:id', adminEmployees.updateStation);
router.post('/stations/:id/archive', adminEmployees.archiveStation);

// ---- Roles -----------------------------------------------------------------
router.get('/roles', adminEmployees.listRoles);
router.post('/roles', adminEmployees.createRole);
router.patch('/roles/:id', adminEmployees.updateRole);
router.delete('/roles/:id', adminEmployees.deleteRole);

// ---- Locations -------------------------------------------------------------
router.get('/locations', adminEmployees.listLocations);
router.post('/locations', adminEmployees.createLocation);
router.patch('/locations/:id', adminEmployees.updateLocation);
router.delete('/locations/:id', adminEmployees.deleteLocation);

export default router;