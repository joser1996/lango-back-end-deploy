const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema({
    user_id: String,
    word_one: String,
    word_two: String,
    seen: Boolean,
    correct: Boolean,
    deck: String
});

module.exports = mongoose.model('CardModel', cardSchema, 'flashcards');