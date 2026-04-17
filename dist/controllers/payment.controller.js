"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePaymentStatus = exports.getPendingPayments = exports.verifyPayment = void 0;
const db_1 = __importDefault(require("../config/db"));
const mail_service_1 = require("../services/mail.service");
const verifyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { planType, amount, transactionId } = req.body;
        const file = req.file;
        if (!planType || !amount || !transactionId) {
            return res.status(400).json({ error: 'Missing required payment details.' });
        }
        if (!file) {
            return res.status(400).json({ error: 'Payment screenshot is required.' });
        }
        // Prevent duplicate transaction IDs for the same user
        const existingPayment = yield db_1.default.pendingPayment.findFirst({
            where: {
                userId,
                transactionId,
            },
        });
        if (existingPayment) {
            return res.status(400).json({ error: 'This transaction ID has already been submitted.' });
        }
        const pendingPayment = yield db_1.default.pendingPayment.create({
            data: {
                userId,
                planType,
                amount: parseFloat(amount),
                transactionId,
                screenshotUrl: file.filename,
                status: 'PENDING',
            },
        });
        res.status(201).json({
            message: 'Payment submitted successfully. Please wait for admin verification.',
            paymentId: pendingPayment.id
        });
    }
    catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Internal server error while processing payment.' });
    }
});
exports.verifyPayment = verifyPayment;
const getPendingPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const payments = yield db_1.default.pendingPayment.findMany({
            where: { status: 'PENDING' },
            include: { user: { select: { mobile: true, email: true, regId: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(payments);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending payments.' });
    }
});
exports.getPendingPayments = getPendingPayments;
const updatePaymentStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const id = req.params.id;
        const { status } = req.body; // 'APPROVED' or 'REJECTED'
        if (!['APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be APPROVED or REJECTED.' });
        }
        const payment = yield db_1.default.pendingPayment.findUnique({
            where: { id },
            include: { user: { select: { email: true, profile: { select: { firstName: true } } } } }
        });
        if (!payment) {
            return res.status(404).json({ error: 'Payment record not found.' });
        }
        if (status === 'APPROVED') {
            // Calculate expiration date
            const durationMonths = payment.planType === 'GOLD' ? 12 : payment.planType === 'SILVER' ? 6 : 0;
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + durationMonths);
            // Update User Plan
            yield db_1.default.user.update({
                where: { id: payment.userId },
                data: {
                    planType: payment.planType,
                    paymentDone: true,
                    planExpiresAt: expiresAt,
                    lastPaidOn: new Date(),
                },
            });
        }
        yield db_1.default.pendingPayment.update({
            where: { id },
            data: { status },
        });
        // Notify User
        if ((_a = payment.user) === null || _a === void 0 ? void 0 : _a.email) {
            (0, mail_service_1.sendPaymentStatusEmail)(payment.user.email, ((_b = payment.user.profile) === null || _b === void 0 ? void 0 : _b.firstName) || 'User', payment.planType, status).catch(e => console.error("Notification Error:", e));
        }
        res.json({ message: `Payment ${status.toLowerCase()} successfully.` });
    }
    catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Internal server error while updating payment.' });
    }
});
exports.updatePaymentStatus = updatePaymentStatus;
