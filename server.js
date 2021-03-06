const express =  require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const session = require('express-session');
const cookieSession = require('cookie-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy; 
const APIRequest = require("request");
dotenv.config();
const UserModel = require('./User');
const FlashCard = require('./FlashCard');
const DeckModel = require('./Deck');

const app = express();

function evalBool(val) {
    return (val === 'true' ? true : false);
}

mongoose.connect(`${process.env.START_MONGODB}${process.env.MONGO_USER}:${process.env.MONGO_PASS}${process.env.END_MONGODB}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}, (err) => {
    if (err) {
        console.error('\x1b[31m',"Failed to Connect: ", err);
    }
    console.log("Connected to mongoose succesfully")
});
app.disable('etag');
app.use(express.json());

var redirectFailURL="";
var redirectURL="";
if (evalBool(process.env.DEV_MODE)) {
    console.log("Developer Mode")
    app.use(cors({ origin: "http://localhost:3000", credentials: true})); //local
    redirectFailURL = "http://localhost:3000/login"
    redirectURL = "http://localhost:3000/"
} else {
    console.log("Deployed Mode")
    app.use(cors({ origin: "https://lango-client-deploy.vercel.app", credentials: true}));
    redirectFailURL = "https://lango-client-deploy.vercel.app/login"
    redirectURL = "https://lango-client-deploy.vercel.app/"
}

var redirectLogin="";
if (evalBool(process.env.DEV_MODE)) {
    redirectLogin = "http://localhost:3000/login"
} else {
    redirectLogin = "https://lango-client-deploy.vercel.app/login"
}



if (evalBool(process.env.DEV_MODE)) {
    app.use(cookieSession({
        maxAge: 6*60*60*1000, //6 hours
        keys: ['hanger waldo mercy dance']
        // sameSite: false,
        // secure: true,
        // httpOnly: false
    }));
} else {
app.set("trust proxy", 1);
    //HEROKU
    app.use(
        session({
            secret: "secretcode",
            resave: true,
            saveUninitialized: true,
            cookie: {
                sameSite: "none",
                secure: true,
                maxAge: 1000*60*60*24*7
            }
        })
    )
}

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    console.log("Serialize: ", user);
    return done(null, user._id);
});

passport.deserializeUser((id, done) => {
    UserModel.findById(id, (err, doc) => {
        console.log("Deserialize: ", doc);
        return done(null, doc)
    });
});

//Step 2

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },

  //Called on successful authentication
  //step 3
  function(accessToken, refreshToken, profile, cb) {
    console.log("SUccesfully logged in: ", profile);
    UserModel.findOne({ googleId: profile.id }, async (err, doc) => {
        if (err) {
            console.error(err);
            return cb(err, null)
        }
        if (!doc) {
            //user doesn't exist
            console.log("Creating a new document");
            const document = new UserModel({
                googleId: profile.id,
                userName: profile.name.givenName
            });

            await document.save();
            cb(null, document);
        } else {
            console.log("Existing doc", doc);
            cb(null, doc);
        }
    });
  } 
));

//Step 1
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));

//Step 4
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: redirectFailURL }),
  function(_req, res) {
    // Successful authentication, redirect home.
    res.redirect(redirectURL);
});

app.get('/', (req, res) => {res.send("Hello World")});

app.get('/logout', (req, res) => {
    console.log('LOGGIN USER OUT');
    req.logout();
    res.json({status: 'done', url: redirectLogin});
});

app.get('/get/user', (req, res) => {
    console.log("USER: ", req.user);
    let responseObj = {user: null};
    if (req.user) {
        responseObj.user = req.user;
    }
    res.send(responseObj);
});

app.get('/translate/word', (req, res, next) => {
    let queryObj = req.query;
    let url = process.env.API_URL + process.env.API_KEY;
    let code = queryObj.code;
    console.log('Recieved code: ', code);
    if (queryObj.english != undefined ) {
        let sourceWord = queryObj.english;
        let requestObj = {
            "source": "en",
            "target": code,
            "q": [sourceWord] 
        }

        APIRequest({
            url: url,
            method: "POST",
            headers: {"content-type": "application/json"},
            json: requestObj
        }, APICallback
        );

        function APICallback(err, APIResHead, APIResBody) {
            if (err || (APIResHead.statusCode!= 200)) {
                console.log("Got an API Error");
                console.log(APIResBody);
                let responseObj = {
                    error: "Got an API error",
                    errorObj: APIResBody
                }
                res.status(APIResHead.statusCode).send(responseObj);
            } else {
                //console.log("Body: ", APIResBody)
                let response = {
                    "english": sourceWord,
                    "japanese": APIResBody.data.translations[0].translatedText
                };
                res.json(response);
            }
        }
    } else {
        let responseObj = {
            error: "Source language in query was not defined"
        }
        res.send(responseObj);
    }

});

app.get('/store/words', (req, res) => {
    let queryObj = req.query;
    if (!queryObj) {
        console.error("NO query parameters")
        return res.send({error: "Query parameters weren't passed"});
    }
    if (!req.user) {
        console.error("User isnt defined log in")
        return res.send({error: "User isn't defined. Pleas Log in"});
    }
    const document = new FlashCard({
        user_id: req.user._id,
        word_one: queryObj.english,
        word_two: queryObj.japanese,
        seen: true,
        correct: true
    });

    resObj = {success: true};
    document.save();
    res.send(resObj);
});

app.post('/store/cards', (req, res) => {
    let wordPairs = req.body;
    console.log('storing words', wordPairs);
    let queryObj = req.query;
    console.log('Storing Deck: ', queryObj.deck)

    if (!req.user) {
        console.error("User isnt defined log in")
        return res.send({error: "User isn't defined. Pleas Log in"});
    }
    for (const card of wordPairs) {
        const document = new FlashCard({
            user_id: req.user._id,
            word_one: card.native,
            word_two: card.translated,
            seen: true,
            correct: true,
            deck: queryObj.deck
        });
        document.save();
    }

    responseObject = {success: true};
    res.send(responseObject);
});
 
app.get('/create/deck', (req, res, next) => {
    let queryObj = req.query;
    let deckName = queryObj.deck;
    console.log('Attempting to create Deck: ', deckName);
    //check to see if deck exists
    console.log('For user: ', req.user)    
    if (!req.user){
        res.send(JSON.stringify({status: 'Not logged in'})) 
        next();
    } else {
        console.log('ID: ', req.user._id)
        let userId = req.user._id;
        DeckModel.findOne({deck_name: queryObj.deck}, async (err, doc) => {
            if (err) {
                console.error(err);
                res.send(JSON.stringify({status: 'fail', error: err}))
            } else if (!doc) {
                //deck doesn't exist
                console.log('Creating new deck');
                const document = new DeckModel({
                    deck_name: deckName,
                    user_id: userId
                })
                await document.save();
                res.send(JSON.stringify({status: 'success'}))
            } else {
                console.log("Deck already exists");
                res.send(JSON.stringify({status: 'duplicate'}))
            }
        });
    }
});

app.get('/delete/deck', (req, res) => {
    let deckId = req.query.deckId;
    console.log("attempting to delete")
    if (!req.user) {
        res.send(JSON.stringify({status: 'Not logged in'}))
    } else {
        let userId = req.user._id;
        DeckModel.findOne({_id: deckId}, async (err, doc) => {
            if (err) {
                console.error(err);
                res.send(JSON.stringify({status: 'fail', error: err}))
            } else if (!doc) {
                console.log('Deck no longer exists');
                res.send(JSON.stringify({status: 'fail', error: 'Doesn\'t Exist'}))
            } else if (doc) {
                console.log('Attempting to delete deck');
                doc.remove();
                res.send(JSON.stringify({status: 'success'}))
            }
        })
    }

});

app.get('/get/decks', (req, res) => {
    const userId = req.user._id;
    if (userId === null) {
        res.send({success: false})
    } else {
        console.log("Sending Deck objects");
        DeckModel.find({user_id: userId}, (err, doc) => {
            let responseObj = {
                success: true,
                data: doc
            }
            res.send(responseObj);
        })
    }
});

app.get('/get/cards', (req, res) => {
    const userId = req.user._id;
    let queryObj = req.query;
    let deckName = queryObj.deck;

    console.log("ID: ", userId);
    if (userId === null) {
        res.send({success: false})
    } else {
        console.log("Sending cards")
        FlashCard.find({user_id: userId, deck: deckName}, (err, doc) => {
            //console.log("Doc from DB: ", doc)
            let responseObj = {
                success: true,
                data: doc
            }
            res.send(responseObj);
        });
    }
});

app.get('/test/db', (req, res) => {
    UserModel.find({}, (err, users) => {
        if(err) {
            res.send(err)
        } else if (users) {
            var userMap = {};
            users.forEach(function(user) {
                userMap[user._id] = user;
            });
            res.send(userMap);
        } else {
            res.send("Here");
        }
    });
});

app.listen(process.env.PORT || 4000, () => {
    console.log("Server Started");
});
