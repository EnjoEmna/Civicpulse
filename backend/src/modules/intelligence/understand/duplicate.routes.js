const express = require("express");

const authenticate = require("../../../middleware/authenticate");
const { checkDuplicates } = require("./duplicate.controller");

const router = express.Router();

router.post("/duplicate-check", authenticate, checkDuplicates);

module.exports = router;
