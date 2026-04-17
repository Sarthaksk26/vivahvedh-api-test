"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const router = (0, express_1.Router)();
// @route POST /api/auth/register
// @desc Register a new user profile
router.post('/register', auth_controller_1.register);
// @route POST /api/auth/login
// @desc Omni-login with RegID, Email, or Mobile
router.post('/login', auth_controller_1.login);
exports.default = router;
