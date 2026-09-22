'use strict';
const axios = require('axios');

const BASE_URL = process.env.PIKABORA_BACKEND_URL || 'http://localhost:8000';

async function getRecommendation(payload) {
  const res = await axios.post(`${BASE_URL}/nutrition/recommend`, payload, { timeout: 5000 });
  return res.data;
}

async function sendFeedback(payload) {
  const res = await axios.post(`${BASE_URL}/nutrition/feedback`, payload, { timeout: 5000 });
  return res.data;
}

module.exports = { getRecommendation, sendFeedback, BASE_URL };
