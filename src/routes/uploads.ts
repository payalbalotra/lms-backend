import { Router } from 'express';
import {
  deleteUploadedAsset,
  presignDocumentUpload,
  presignImageUpload,
  presignVideoUpload,
} from '../controllers/uploads';

const router = Router();

// POST /image    -> { uploadUrl, key, publicUrl, expiresIn }
// POST /video    -> { uploadUrl, key, publicUrl, expiresIn }
// POST /document -> { uploadUrl, key, publicUrl, expiresIn }  (SOP import flow)
// DELETE /       -> { ok: true }   body or ?url= holds the public URL of the
//                                  object to remove.
// Mounted under /admin/uploads in routes/index.ts after requireAuth +
// requireAdmin. Future sibling paths (e.g. multipart/) join here.
router.post('/image', presignImageUpload);
router.post('/video', presignVideoUpload);
router.post('/document', presignDocumentUpload);
router.delete('/', deleteUploadedAsset);

export default router;
