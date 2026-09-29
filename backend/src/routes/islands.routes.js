const express = require('express');
const router = express.Router();
const islandsController = require('../controllers/islands.controller');

router.get('/', islandsController.getAllIslands);

module.exports = router;