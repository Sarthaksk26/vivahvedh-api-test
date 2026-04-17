"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const search_controller_1 = require("../controllers/search.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.optionalAuth, search_controller_1.executeSearch);
router.get('/public/:id', auth_middleware_1.optionalAuth, search_controller_1.getPublicProfile);
exports.default = router;
