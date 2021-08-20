const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: String,
    userName: {
        required: false,
        type: String
    }
});

module.exports = mongoose.model('UserModel', UserSchema);