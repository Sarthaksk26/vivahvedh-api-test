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


// ─── Routes accessible with requiresPasswordChange still true ───────────────
// A user who must change their password can still read their own profile so the
// dashboard renders the Security tab with the password-change form.
router.get('/profile', requireAuth, requireActiveAccount, getMyProfile);

// Password changes remain available to pending or forced-activation users.
router.post('/change-password', requireAuth, requireActiveAccount, changePassword);

// ─── All other routes require a completed, confirmed password ─────────────────
router.use(requireAuth, requireActivePassword, requireActiveAccount);

router.delete('/account', deleteAccount);
router.post('/report', reportProfile);
router.delete('/delete-photo/:imageId', deletePhoto);
router.patch('/set-profile-photo/:imageId', setProfilePhoto);
router.get('/documents/:type', getSignedDocumentUrl);
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
