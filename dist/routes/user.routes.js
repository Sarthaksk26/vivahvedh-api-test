"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const multer_1 = require("../config/multer");
const router = (0, express_1.Router)();
router.get('/profile', auth_middleware_1.requireAuth, user_controller_1.getMyProfile);
router.post('/upload-photo', auth_middleware_1.requireAuth, multer_1.upload.single('photo'), multer_1.processImage, user_controller_1.uploadPhoto);
router.delete('/delete-photo/:imageId', auth_middleware_1.requireAuth, user_controller_1.deletePhoto);
router.patch('/update', auth_middleware_1.requireAuth, user_controller_1.updateProfile);
router.post('/change-password', auth_middleware_1.requireAuth, user_controller_1.changePassword);
// Shortlist
router.post('/shortlist', auth_middleware_1.requireAuth, user_controller_1.shortlistProfile);
router.get('/shortlist', auth_middleware_1.requireAuth, user_controller_1.getMyShortlist);
// Who viewed my profile
router.get('/profile-viewers', auth_middleware_1.requireAuth, user_controller_1.getProfileViewers);
exports.default = router;
