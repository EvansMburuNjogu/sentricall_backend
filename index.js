const express = require('express');
const mongoose = require('mongoose')
require('dotenv').config();
const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 25,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    socketTimeoutMS: 20000,
    autoIndex: false,
    family: 4,
})
mongoose.connection.on('error', err => {
    console.log(err.message)
})
mongoose.connection.on('open', () => {
    const info = "Database has conneted successfully."
    console.log(info)
})

app.get('/health', (req, res) => {
  res.send('Server is healthy');
});

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/user');
const reportRoutes = require('./src/routes/report')
const sessionRoutes = require('./src/routes/session')
const chatRoutes =  require('./src/routes/chat')

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/sessions',sessionRoutes)
app.use('/api/v1/chats',chatRoutes)

app.listen(process.env.PORT, () => {
  console.log(`Server is running at http://localhost:${process.env.PORT}`);
});
