import express, { type Router } from 'express';
import {
  presignImageUpload,
  presignVideoUpload,
  presignDocumentUpload,
  deleteUploadedAsset,
} from '../../controllers/v1/uploads.controller.ts';
import { requireAuth } from '../../config/middleware.ts';
import { requireRoles } from '../../shared/middleware/requireRoles.middleware.ts';

const uploadsRoute: Router = express.Router();
uploadsRoute.use(requireAuth, requireRoles(['super_admin']));

// POST /image    -> { uploadUrl, key, publicUrl, expiresIn }
// POST /video    -> { uploadUrl, key, publicUrl, expiresIn }
// POST /document -> { uploadUrl, key, publicUrl, expiresIn }
// DELETE /       -> { ok: true }
// Mounted under /api/admin/uploads in routes/v1/index.ts after requireAuth + requireRoles(['super_admin']).
uploadsRoute.post('/image', presignImageUpload);
uploadsRoute.post('/video', presignVideoUpload);
uploadsRoute.post('/document', presignDocumentUpload);
uploadsRoute.delete('/', deleteUploadedAsset);

export default uploadsRoute;
