import { Router } from 'express';
import { 
  getMyProfile, uploadPhoto, deletePhoto, updateProfile, 
  changePassword, shortlistProfile, getMyShortlist, 
  getProfileViewers 
} from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { upload, processImage } from '../config/multer';

const router = Router();

router.get('/profile', requireAuth, getMyProfile);
router.post('/upload-photo', requireAuth, upload.single('photo'), processImage, uploadPhoto);
router.delete('/delete-photo/:imageId', requireAuth, deletePhoto);
router.patch('/update', requireAuth, updateProfile);
router.post('/change-password', requireAuth, changePassword);

// Shortlist
router.post('/shortlist', requireAuth, shortlistProfile);
router.get('/shortlist', requireAuth, getMyShortlist);

// Who viewed my profile
router.get('/profile-viewers', requireAuth, getProfileViewers);

export default router;
