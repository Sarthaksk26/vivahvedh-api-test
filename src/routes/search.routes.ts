import { Router } from 'express';
import { executeSearch, getPublicProfile } from '../controllers/search.controller';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', optionalAuth, executeSearch);
router.get('/public/:id', optionalAuth, getPublicProfile);

export default router;
