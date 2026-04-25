import { Router } from 'express';
import {
  getMyProfile, uploadPhoto, deletePhoto, updateProfile,
  changePassword, shortlistProfile, getMyShortlist,
  getProfileViewers
} from '../controllers/user.controller';
import { requireAuth, requireActivePassword } from '../middleware/auth.middleware';
import { upload, processImage } from '../config/multer';

const router = Router();

// All user routes require auth + active password (except change-password)
router.post('/change-password', requireAuth, changePassword);

router.use(requireAuth, requireActivePassword);

router.get('/profile', getMyProfile);
router.post('/upload-photo', upload.single('photo'), processImage, uploadPhoto);
router.delete('/delete-photo/:imageId', deletePhoto);
router.patch('/update', updateProfile);

// Shortlist
router.post('/shortlist', shortlistProfile);
router.get('/shortlist', getMyShortlist);

// Who viewed my profile
router.get('/profile-viewers', getProfileViewers);

export default router;
