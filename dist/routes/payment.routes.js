"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const multer_1 = require("../config/multer");
const router = (0, express_1.Router)();
// User endpoint to submit proof
router.post('/verify', auth_middleware_1.requireAuth, multer_1.upload.single('screenshot'), multer_1.processImage, payment_controller_1.verifyPayment);
// Admin endpoints to manage proof
router.get('/admin/pending', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, payment_controller_1.getPendingPayments);
router.patch('/admin/verify/:id', auth_middleware_1.requireAuth, auth_middleware_1.requireAdmin, payment_controller_1.updatePaymentStatus);
exports.default = router;
