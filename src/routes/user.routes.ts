import { Router } from 'express';
import {
  getMyProfile, uploadPhoto, deletePhoto, setProfilePhoto, updateProfile,
  changePassword, shortlistProfile, getMyShortlist,
  getProfileViewers, uploadKyc, uploadIncomeProof, uploadMedicalReport, deleteAccount, reportProfile
} from '../controllers/user.controller';
import { requireAuth, requireActivePassword, requireActiveAccount } from '../middleware/auth.middleware';
import { getSignedDocumentUrl } from '../controllers/document.controller';
import { upload, processImage, uploadDocument, processDocument } from '../config/multer';

const router = Router();

// Routes that only need auth (not active password check)
router.post('/change-password', requireAuth, changePassword);
router.delete('/account', requireAuth, deleteAccount);
router.post('/report', requireAuth, reportProfile);
router.delete('/delete-photo/:imageId', requireAuth, deletePhoto);
router.patch('/set-profile-photo/:imageId', requireAuth, setProfilePhoto);
router.get('/documents/:type', requireAuth, getSignedDocumentUrl);

// Routes that need auth + active password + active account status check
router.use(requireAuth, requireActivePassword, requireActiveAccount);


router.get('/profile', getMyProfile);
router.post('/upload-photo', upload.single('photo'), processImage, uploadPhoto);
router.post('/upload-kyc', uploadDocument.single('document'), processDocument, uploadKyc);
router.post('/upload-income-proof', uploadDocument.single('document'), processDocument, uploadIncomeProof);
router.post('/upload-medical-report', uploadDocument.single('document'), processDocument, uploadMedicalReport);
router.patch('/update', updateProfile);

// Shortlist
router.post('/shortlist', shortlistProfile);
router.get('/shortlist', getMyShortlist);

// Who viewed my profile
router.get('/profile-viewers', getProfileViewers);

export default router;
