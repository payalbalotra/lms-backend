import { Router } from 'express';
import * as adminEmployees from '../../controllers/admin/employees';

const router = Router();

router.get('/', adminEmployees.listEmployees);
router.post('/', adminEmployees.createEmployee);
router.get('/roles', adminEmployees.listRoles);
router.get('/stations', adminEmployees.listStations);
router.get('/locations', adminEmployees.listLocations);
router.post('/:id/invites', adminEmployees.resendInvite);
router.post('/:id/deactivate', adminEmployees.deactivate);
router.post('/:id/reactivate', adminEmployees.reactivate);

export default router;