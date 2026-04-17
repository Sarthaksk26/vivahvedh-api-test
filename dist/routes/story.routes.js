"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const multer_1 = require("../config/multer");
const story_controller_1 = require("../controllers/story.controller");
const router = (0, express_1.Router)();
// PUBLIC: Get all approved success stories
router.get('/', story_controller_1.getApprovedStories);
// USER: Submit a story (with optional photo)
router.post('/submit', auth_middleware_1.requireAuth, multer_1.upload.single('photo'), multer_1.processImage, story_controller_1.submitStory);
// ADMIN: Get pending stories for review
router.get('/admin/pending', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, story_controller_1.getPendingStories);
// ADMIN: Get all stories
router.get('/admin/all', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, story_controller_1.getAllStories);
// ADMIN: Approve or reject a story
router.post('/admin/review', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, story_controller_1.reviewStory);
// ADMIN: Create a story directly (auto-approved)
router.post('/admin/create', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, multer_1.upload.single('photo'), multer_1.processImage, story_controller_1.createStory);
// ADMIN: Delete a story
router.delete('/admin/:id', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, story_controller_1.deleteStory);
exports.default = router;
