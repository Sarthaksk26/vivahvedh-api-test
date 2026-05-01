import { Router } from 'express';
import {
  getMyProfile, uploadPhoto, deletePhoto, setProfilePhoto, updateProfile,
  changePassword, shortlistProfile, getMyShortlist,
  getProfileViewers
} from '../controllers/user.controller';
import { requireAuth, requireActivePassword, requireActiveAccount } from '../middleware/auth.middleware';
import { upload, processImage } from '../config/multer';

const router = Router();

// Routes that only need auth (not active password check)
router.post('/change-password', requireAuth, changePassword);
router.delete('/delete-photo/:imageId', requireAuth, deletePhoto);
router.patch('/set-profile-photo/:imageId', requireAuth, setProfilePhoto);

// Routes that need auth + active password + active account status check
router.use(requireAuth, requireActivePassword, requireActiveAccount);


router.get('/profile', getMyProfile);
router.post('/upload-photo', upload.single('photo'), processImage, uploadPhoto);
router.patch('/update', updateProfile);

// Shortlist
router.post('/shortlist', shortlistProfile);
router.get('/shortlist', getMyShortlist);

// Who viewed my profile
router.get('/profile-viewers', getProfileViewers);

export default router;
