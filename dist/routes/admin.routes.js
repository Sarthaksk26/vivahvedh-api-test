"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// @route   GET /api/admin/pending
router.get('/pending', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.getPendingApprovals);
// @route   GET /api/admin/all-users
router.get('/all-users', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.getAllUsers);
// @route   POST /api/admin/approve
router.post('/approve', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.approveUser);
// @route   POST /api/admin/ban
router.post('/ban', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.banUser);
// @route   DELETE /api/admin/delete/:id
router.delete('/delete/:id', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.deleteUser);
// Get Enquiries
router.get('/enquiries', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.getEnquiries);
// Reply to Enquiry
router.post('/enquiries/reply', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.replyToEnquiry);
// Resolve Enquiry
router.patch('/enquiries/resolve', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.markEnquiryResolved);
// Set user plan (FREE / SILVER / GOLD)
router.post('/set-plan', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.setUserPlan);
// @route   POST /api/admin/users/create
// @desc    Admin creates a profile for an offline/walk-in customer
router.post('/users/create', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, admin_controller_1.createOfflineUser);
exports.default = router;
