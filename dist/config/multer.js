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
exports.processImage = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp"));
// Ensure uploads directory exists
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// Use Memory Storage so we can process the buffer with sharp before saving
const storage = multer_1.default.memoryStorage();
// File filter to block malicious non-image payloads
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP are allowed.'), false);
    }
};
// Export the middleware ready to digest a single field max 5MB
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MegaBytes max
});
// Middleware to process image buffer with sharp and save as WebP
const processImage = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!req.file) {
        return next();
    }
    try {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'unknown';
        const filename = `img-${userId}-${uniqueSuffix}.webp`;
        const outputPath = path_1.default.join(uploadDir, filename);
        yield (0, sharp_1.default)(req.file.buffer)
            .resize({ width: 1200, withoutEnlargement: true }) // Resize large images
            .webp({ quality: 80 }) // Compress and convert to WebP
            .toFile(outputPath);
        // Update req.file to reflect the saved file so controllers can use it
        req.file.filename = filename;
        req.file.path = outputPath;
        req.file.mimetype = 'image/webp';
        next();
    }
    catch (error) {
        console.error('Image Processing Error:', error);
        res.status(500).json({ error: 'Failed to process image.' });
    }
});
exports.processImage = processImage;
