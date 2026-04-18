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
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const total = yield prisma.user.count();
        const active = yield prisma.user.count({ where: { accountStatus: 'ACTIVE' } });
        const users = yield prisma.user.count({ where: { role: 'USER' } });
        const admins = yield prisma.user.count({ where: { role: 'ADMIN' } });
        const activeUsers = yield prisma.user.count({ where: { accountStatus: 'ACTIVE', role: 'USER' } });
        const activeUsersWithProfile = yield prisma.user.count({ where: { accountStatus: 'ACTIVE', role: 'USER', profile: { isNot: null } } });
        console.log('--- DATABASE STATUS ---');
        console.log(`Total Users: ${total}`);
        console.log(`Active Users: ${active}`);
        console.log(`Role USER: ${users}`);
        console.log(`Role ADMIN: ${admins}`);
        console.log(`Active Role USER (Total): ${activeUsers}`);
        console.log(`Active Role USER (With Profile): ${activeUsersWithProfile}`);
        const sample = yield prisma.user.findMany({
            take: 10,
            select: { regId: true, role: true, accountStatus: true, profile: { select: { id: true } } }
        });
        console.log('--- SAMPLE ---');
        console.log(JSON.stringify(sample, null, 2));
    });
}
main().catch(console.error);
