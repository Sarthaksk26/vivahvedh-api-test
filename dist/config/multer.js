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
exports.uploadDocument = exports.processImage = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp"));
// ── Directory setup ─────────────────────────────────────────────────
const UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads');
const DOCS_DIR = path_1.default.join(UPLOAD_DIR, 'docs');
for (const dir of [UPLOAD_DIR, DOCS_DIR]) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
// ── Shared constants ────────────────────────────────────────────────
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIME_TYPES = [
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
];
// ── Image upload (memory storage → sharp processing) ────────────────
const imageFilter = (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'));
    }
};
exports.upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
/**
 * Middleware: process an in-memory image buffer through sharp → WebP,
 * then persist to disk. Updates req.file metadata for downstream controllers.
 */
const processImage = (req, _res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!req.file)
        return next();
    try {
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || 'anon';
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const filename = `img-${userId}-${uniqueSuffix}.webp`;
        const outputPath = path_1.default.join(UPLOAD_DIR, filename);
        yield (0, sharp_1.default)(req.file.buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);
        req.file.filename = filename;
        req.file.path = outputPath;
        req.file.mimetype = 'image/webp';
        next();
    }
    catch (error) {
        next(error);
    }
});
exports.processImage = processImage;
// ── Document upload (disk storage, no sharp) ────────────────────────
const documentFilter = (_req, file, cb) => {
    if (DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only PDF and ZIP files are allowed.'));
    }
};
const documentStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCS_DIR),
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `doc-${uniqueSuffix}${ext}`);
    },
});
exports.uploadDocument = (0, multer_1.default)({
    storage: documentStorage,
    fileFilter: documentFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});
