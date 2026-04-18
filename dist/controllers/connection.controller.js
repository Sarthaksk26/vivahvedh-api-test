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
exports.getMyConnections = exports.rejectInterest = exports.acceptInterest = exports.sendInterest = void 0;
const db_1 = __importDefault(require("../config/db"));
const mail_service_1 = require("../services/mail.service");
// 1. Send an Interest Request to another user
const sendInterest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const senderId = req.user.id;
        const { receiverId } = req.body;
        // Security Check: Only ACTIVE users can send proposals
        if (req.user.accountStatus !== 'ACTIVE') {
            res.status(403).json({ error: "Your account is currently pending approval. You cannot send match proposals yet." });
            return;
        }
        if (senderId === receiverId) {
            res.status(400).json({ error: "You cannot send an interest to yourself." });
            return;
        }
        // Check if request already exists in either direction
        const existing = yield db_1.default.request.findFirst({
            where: {
                OR: [
                    { senderId, receiverId },
                    { senderId: receiverId, receiverId: senderId } // Reciprocal
                ]
            }
        });
        if (existing) {
            res.status(400).json({ error: "A connection history already exists with this user." });
            return;
        }
        const newRequest = yield db_1.default.request.create({
            data: {
                senderId,
                receiverId,
                status: 'PENDING'
            }
        });
        // Trigger Email to Receiver safely
        const receiverData = yield db_1.default.user.findUnique({
            where: { id: receiverId },
            include: { profile: true }
        });
        const senderData = yield db_1.default.user.findUnique({
            where: { id: senderId },
            include: { profile: true }
        });
        if ((receiverData === null || receiverData === void 0 ? void 0 : receiverData.email) && (senderData === null || senderData === void 0 ? void 0 : senderData.profile)) {
            // Async mail dispatch
            (0, mail_service_1.sendConnectionRequestEmail)(receiverData.email, ((_a = receiverData.profile) === null || _a === void 0 ? void 0 : _a.firstName) || 'Member', `${(_b = senderData.profile) === null || _b === void 0 ? void 0 : _b.firstName} ${(_c = senderData.profile) === null || _c === void 0 ? void 0 : _c.lastName}`);
        }
        res.status(200).json({ message: "Interest expressed successfully!", request: newRequest });
    }
    catch (error) {
        console.error("Express Interest Error:", error);
        res.status(500).json({ error: "Failed to send request." });
    }
});
exports.sendInterest = sendInterest;
// 2. Accept a Pending Interest Request
const acceptInterest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const receiverId = req.user.id;
        const { requestId } = req.body;
        const request = yield db_1.default.request.findUnique({ where: { id: requestId } });
        if (!request || request.receiverId !== receiverId) {
            res.status(403).json({ error: "Invalid request." });
            return;
        }
        const updatedRequest = yield db_1.default.request.update({
            where: { id: requestId },
            data: { status: 'ACCEPTED' }
        });
        // Trigger Acceptance Email to Original Sender
        const senderData = yield db_1.default.user.findUnique({
            where: { id: request.senderId },
            include: { profile: true }
        });
        const receiverData = yield db_1.default.user.findUnique({
            where: { id: receiverId },
            include: { profile: true }
        });
        if ((senderData === null || senderData === void 0 ? void 0 : senderData.email) && (receiverData === null || receiverData === void 0 ? void 0 : receiverData.profile)) {
            (0, mail_service_1.sendConnectionAcceptedEmail)(senderData.email, ((_a = senderData.profile) === null || _a === void 0 ? void 0 : _a.firstName) || 'Member', `${(_b = receiverData.profile) === null || _b === void 0 ? void 0 : _b.firstName} ${(_c = receiverData.profile) === null || _c === void 0 ? void 0 : _c.lastName}`);
        }
        res.status(200).json({ message: "Request accepted! You are now connected.", request: updatedRequest });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to accept request." });
    }
});
exports.acceptInterest = acceptInterest;
// 3. Reject a Pending Request
const rejectInterest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const receiverId = req.user.id;
        const { requestId } = req.body;
        const request = yield db_1.default.request.updateMany({
            where: { id: requestId, receiverId },
            data: { status: 'REJECTED' }
        });
        if (request.count === 0) {
            res.status(404).json({ error: "Request not found" });
            return;
        }
        res.status(200).json({ message: "Request rejected." });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to reject." });
    }
});
exports.rejectInterest = rejectInterest;
// 4. Fetch My Dashboard Connections (Incoming & Outgoing logic)
const getMyConnections = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        // Everything sent to me (Incoming)
        const incoming = yield db_1.default.request.findMany({
            where: { receiverId: userId },
            include: {
                sender: {
                    include: { profile: true, images: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Everything I sent (Outgoing)
        const outgoing = yield db_1.default.request.findMany({
            where: { senderId: userId },
            include: {
                receiver: {
                    include: { profile: true, images: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ incoming, outgoing });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch connections." });
    }
});
exports.getMyConnections = getMyConnections;
