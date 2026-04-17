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
exports.deleteStory = exports.createStory = exports.reviewStory = exports.getAllStories = exports.getPendingStories = exports.submitStory = exports.getApprovedStories = void 0;
const db_1 = __importDefault(require("../config/db"));
const zod_1 = require("zod");
// ==============================
// PUBLIC: Get all approved stories
// ==============================
const getApprovedStories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stories = yield db_1.default.successStory.findMany({
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(stories);
    }
    catch (error) {
        console.error('Get Stories Error:', error);
        res.status(500).json({ error: 'Failed to fetch success stories.' });
    }
});
exports.getApprovedStories = getApprovedStories;
// ==============================
// USER: Submit a story (requires approval)
// ==============================
const submitStorySchema = zod_1.z.object({
    groomName: zod_1.z.string().min(2, 'Groom name is required'),
    brideName: zod_1.z.string().min(2, 'Bride name is required'),
    message: zod_1.z.string().min(10, 'Please write at least 10 characters').max(1000, 'Message too long (max 1000 chars)')
});
const submitStory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const validatedData = submitStorySchema.parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const story = yield db_1.default.successStory.create({
            data: {
                groomName: validatedData.groomName,
                brideName: validatedData.brideName,
                message: validatedData.message,
                photoUrl,
                status: 'PENDING',
                submittedBy: userId || null
            }
        });
        res.status(201).json({
            message: 'Your success story has been submitted for review! It will appear publicly once approved by our team.',
            storyId: story.id
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error('Submit Story Error:', error);
        res.status(500).json({ error: 'Failed to submit story.' });
    }
});
exports.submitStory = submitStory;
// ==============================
// ADMIN: Get pending stories
// ==============================
const getPendingStories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stories = yield db_1.default.successStory.findMany({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'asc' }
        });
        res.status(200).json(stories);
    }
    catch (error) {
        console.error('Get Pending Stories Error:', error);
        res.status(500).json({ error: 'Failed to fetch pending stories.' });
    }
});
exports.getPendingStories = getPendingStories;
// ==============================
// ADMIN: Get ALL stories (for management)
// ==============================
const getAllStories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stories = yield db_1.default.successStory.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(stories);
    }
    catch (error) {
        console.error('Get All Stories Error:', error);
        res.status(500).json({ error: 'Failed to fetch stories.' });
    }
});
exports.getAllStories = getAllStories;
// ==============================
// ADMIN: Review (approve/reject) a story
// ==============================
const reviewStory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { storyId, status } = req.body;
        if (!storyId || !['APPROVED', 'REJECTED'].includes(status)) {
            res.status(400).json({ error: 'Valid storyId and status (APPROVED/REJECTED) required.' });
            return;
        }
        const story = yield db_1.default.successStory.findUnique({ where: { id: storyId } });
        if (!story) {
            res.status(404).json({ error: 'Story not found.' });
            return;
        }
        yield db_1.default.successStory.update({
            where: { id: storyId },
            data: { status }
        });
        res.status(200).json({ message: `Story ${status.toLowerCase()} successfully.` });
    }
    catch (error) {
        console.error('Review Story Error:', error);
        res.status(500).json({ error: 'Failed to review story.' });
    }
});
exports.reviewStory = reviewStory;
// ==============================
// ADMIN: Create a story directly (auto-approved)
// ==============================
const createStorySchema = zod_1.z.object({
    groomName: zod_1.z.string().min(2),
    brideName: zod_1.z.string().min(2),
    message: zod_1.z.string().min(10).max(1000)
});
const createStory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const validatedData = createStorySchema.parse(req.body);
        const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const story = yield db_1.default.successStory.create({
            data: {
                groomName: validatedData.groomName,
                brideName: validatedData.brideName,
                message: validatedData.message,
                photoUrl,
                status: 'APPROVED',
                submittedBy: null // Admin-created
            }
        });
        res.status(201).json({
            message: 'Success story published!',
            story
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error('Create Story Error:', error);
        res.status(500).json({ error: 'Failed to create story.' });
    }
});
exports.createStory = createStory;
// ==============================
// ADMIN: Delete a story
// ==============================
const deleteStory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        const story = yield db_1.default.successStory.findUnique({ where: { id } });
        if (!story) {
            res.status(404).json({ error: 'Story not found.' });
            return;
        }
        yield db_1.default.successStory.delete({ where: { id } });
        res.status(200).json({ message: 'Story deleted permanently.' });
    }
    catch (error) {
        console.error('Delete Story Error:', error);
        res.status(500).json({ error: 'Failed to delete story.' });
    }
});
exports.deleteStory = deleteStory;
