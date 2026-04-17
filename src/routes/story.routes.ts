import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { upload } from '../config/multer';
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
router.post('/submit', requireAuth, upload.single('photo'), submitStory);

// ADMIN: Get pending stories for review
router.get('/admin/pending', requireAuth, requireAdmin, getPendingStories);

// ADMIN: Get all stories
router.get('/admin/all', requireAuth, requireAdmin, getAllStories);

// ADMIN: Approve or reject a story
router.post('/admin/review', requireAuth, requireAdmin, reviewStory);

// ADMIN: Create a story directly (auto-approved)
router.post('/admin/create', requireAuth, requireAdmin, upload.single('photo'), createStory);

// ADMIN: Delete a story
router.delete('/admin/:id', requireAuth, requireAdmin, deleteStory);

export default router;
