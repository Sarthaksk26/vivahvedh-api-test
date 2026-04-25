"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const multer_1 = require("../config/multer");
const router = (0, express_1.Router)();
// All user routes require auth + active password (except change-password)
router.post('/change-password', auth_middleware_1.requireAuth, user_controller_1.changePassword);
router.use(auth_middleware_1.requireAuth, auth_middleware_1.requireActivePassword);
router.get('/profile', user_controller_1.getMyProfile);
router.post('/upload-photo', multer_1.upload.single('photo'), multer_1.processImage, user_controller_1.uploadPhoto);
router.delete('/delete-photo/:imageId', user_controller_1.deletePhoto);
router.patch('/update', user_controller_1.updateProfile);
// Shortlist
router.post('/shortlist', user_controller_1.shortlistProfile);
router.get('/shortlist', user_controller_1.getMyShortlist);
// Who viewed my profile
router.get('/profile-viewers', user_controller_1.getProfileViewers);
exports.default = router;
