import express, { type Router } from 'express';
import { directUpload } from './uploads.controller.ts';
import multer from 'multer';
import { requireAuth } from '../../middleware/require-auth.ts';
import { requireRoles } from '../../middleware/require-roles.ts';

const uploadsRoute: Router = express.Router();
uploadsRoute.use(requireAuth, requireRoles(['super_admin']));

// POST /       -> { key, publicUrl } (direct upload via multer)
// Mounted under /api/admin/uploads in routes/v1/index.ts after requireAuth + requireRoles(['super_admin']).
import config from '../../config/env.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.r2UploadMaxBytes },
});

uploadsRoute.post('/', upload.single('file'), directUpload);

export default uploadsRoute;
