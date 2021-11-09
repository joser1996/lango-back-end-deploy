const mongoose = require('mongoose');

const deckSchema = new mongoose.Schema({
    deck_name: String,
    user_id: String
});

module.exports = mongoose.model('DeckModel', deckSchema, 'decks')