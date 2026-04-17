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
const db_1 = __importDefault(require("../config/db"));
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🔍 Scanning for Images with localhost URLs...');
        const images = yield db_1.default.image.findMany({
            where: {
                url: {
                    contains: 'localhost'
                }
            }
        });
        console.log(`📌 Found ${images.length} images to clean.`);
        for (const img of images) {
            // Replace the full URL with just the relative path
            const relativePart = img.url.split('/uploads/')[1];
            if (relativePart) {
                const newUrl = `/uploads/${relativePart}`;
                yield db_1.default.image.update({
                    where: { id: img.id },
                    data: { url: newUrl }
                });
                console.log(`✅ Cleaned: ${img.url} -> ${newUrl}`);
            }
        }
        console.log('✨ Database cleanup complete!');
    });
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.$disconnect();
}));
