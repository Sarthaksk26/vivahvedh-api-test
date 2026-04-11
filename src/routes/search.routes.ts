import { Router } from 'express';
import { executeSearch, getPublicProfile } from '../controllers/search.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, executeSearch);
router.get('/public/:id', requireAuth, getPublicProfile);

export default router;
