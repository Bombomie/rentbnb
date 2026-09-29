require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // allows the server to understand JSON data from Android

app.use('/api/v1/auth', authRoutes);

// to verify its working
app.get('/api/v1/status', (req, res) => {
    res.json({ message: 'RentBnb API is running successfully!' });
});

// Routes
app.use('/api/v1/islands', require('./routes/islands.routes'));
app.use('/api/v1/listings', require('./routes/listings.routes'));
app.use('/api/v1/weather', require('./routes/weather.routes'));
app.use('/api/v1/favorites', require('./routes/favorites.routes'));
app.use('/api/v1/bookings', require('./routes/bookings.routes'));
app.use('/api/v1/payments', require('./routes/payments.routes'));
app.use('/api/v1/reviews', require('./routes/reviews.routes'));

app.use('/api/v1/chat', require('./routes/chat.routes'));
app.use('/api/v1/notifications',  require('./routes/notifications.routes'));
app.use('/api/v1/lens', require('./routes/lens.routes'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});