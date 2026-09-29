const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
        }

        const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const meteoResponse = await axios.get(meteoUrl);
        const currentData = meteoResponse.data.current;
        const code = currentData.weather_code;

        let currentCondition = "Unknown";

        if (code === 0) {
            currentCondition = "Clear";
        } else if (code >= 1 && code <= 3) {
            currentCondition = "Cloudy";
        } else if (code === 45 || code === 48) {
            currentCondition = "Foggy";
        } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
            currentCondition = "Rain";
        } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
            currentCondition = "Snow";
        }

        const weatherSummary = {
            temp: currentData.temperature_2m,
            weatherCode: currentData.weather_code,
            condition: currentCondition
        }

        res.status(200).json({ success: true, data: weatherSummary });
    } catch (error) {
        console.error('Error fetching weather:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;