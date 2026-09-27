import { Router } from 'express';
import { requireAuth, requireAdmin, requireActiveAccount, requireActivePassword } from '../middleware/auth.middleware';
import { upload, processImage } from '../config/multer';
import {
  getApprovedStories,
  submitStory,
  getPendingStories,
  getAllStories,
  reviewStory,
  createStory,
  deleteStory
} from '../controllers/story.controller';

const router = Router();

// PUBLIC: Get all approved success stories
router.get('/', getApprovedStories);

// USER: Submit a story (with optional photo)
router.post('/submit', requireAuth, requireActivePassword, requireActiveAccount, upload.single('photo'), processImage, submitStory);

// ADMIN: Get pending stories for review
router.get('/admin/pending', requireAuth, requireActiveAccount, requireAdmin, getPendingStories);

// ADMIN: Get all stories
router.get('/admin/all', requireAuth, requireActiveAccount, requireAdmin, getAllStories);

// ADMIN: Approve or reject a story
router.post('/admin/review', requireAuth, requireActiveAccount, requireAdmin, reviewStory);

// ADMIN: Create a story directly (auto-approved)
router.post('/admin/create', requireAuth, requireActiveAccount, requireAdmin, upload.single('photo'), processImage, createStory);

// ADMIN: Delete a story
router.delete('/admin/:id', requireAuth, requireActiveAccount, requireAdmin, deleteStory);

export default router;
