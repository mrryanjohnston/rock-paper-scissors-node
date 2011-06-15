
/**
 * Module dependencies.
 */

var express  = require('express'),
    mongoose = require('mongoose'),
    models   = require('./models'),
    bcrypt   = require('bcrypt'),
    io       = require('socket.io'),
    User;

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'your secret here' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

//Database Stuff
mongoose.connect('mongodb://localhost/db');
models.initModels(mongoose, function() {
  User = mongoose.model('User');
  Game = mongoose.model('Game');
});

//Dynamic Helpers
app.dynamicHelpers({
  info: function(req, res){
    return req.flash('info');
  },
  warn: function(req, res){
    return req.flash('warn');
  },
  session: function(req, res){
    return req.session;
  }
});

//Route Middleware
function isUsernameTaken(req, res, next) {
  User.findOne({username: req.body.username}, function (err, user) {
    if (err) { throw err; }
    if (!user) {
      next();
    } else {
      req.flash('warn', 'Username already taken!');
      res.redirect('/register');
    }
  });
}

function isPasswordSame(req, res, next) {
  if (req.body.password === req.body.passwordagain) {
    next();
  } else {
    req.flash('warn', 'Passwords don\'t match!');
    res.redirect('/register');
  }
}

function isCredentialCorrect(req, res, next) {
  User.findOne({username: req.body.username}, function (err, user) {
    if (err) { throw err; }
    if (user) {
      bcrypt.compare(req.body.password, user.passwordhash, function(err, passwordIsGood) {
        if (err) { throw err; }
        if (passwordIsGood) { //Password is correct
          next();
        } else {
          req.flash('warn', 'Something went wrong. Please try again.');
          res.redirect('/login');
        }
      });
    } else {
      req.flash('warn', 'Something went wrong. Please try again.');
      res.redirect('/login');
    }
  });
}

function loggedInNotAllowed(req, res, next) {
  if (req.session.username) {
    res.redirect('/');
  } else {
    next();
  }
}

function loggedOutNotAllowed(req, res, next) {
  if (!req.session.username) {
    res.redirect('/');
  } else {
    next();
  }
}

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Rock, Paper, Scissors, Node!'
  });
});

app.get('/register', loggedInNotAllowed, function(req, res){
  res.render('register', {
    title: 'Rock, Paper, Scissors, Node!: Register'
  });
});

app.post('/register', loggedInNotAllowed, isUsernameTaken, isPasswordSame, function(req, res){
  bcrypt.gen_salt(10, function(err, salt) { 
    if (err) { throw err; }
    bcrypt.encrypt(req.body.password, salt, function(err, hash) {
      if (err) { throw err; }
      var newUser = new User();
      newUser.username = req.body.username;
      newUser.passwordhash = hash;
      newUser.wins = 0;
      newUser.losses = 0;
      newUser.rocks = 0;
      newUser.papers = 0;
      newUser.scissors = 0;
      newUser.save(function (err) {
        if (err) { throw err; }
          req.flash('info', 'Registration successful. Please Login!');
          res.redirect('/login');
      });
    }); 
  });
});

app.get('/login', loggedInNotAllowed, function(req, res){
  res.render('login', {
    title: 'Rock, Paper, Scissors, Node!: Login'
  });
});

app.post('/login', loggedInNotAllowed, isCredentialCorrect, function(req, res){
  req.session.username = req.body.username;
  req.flash('info', 'Login successful!');
  res.redirect('/');
});

app.get('/logout', loggedOutNotAllowed, function(req, res){
  req.session.regenerate(function(err){
    if(err) { throw err; }
    req.flash('info', 'You\'ve been logged out');
    res.redirect('/');
  });
});

app.get('/play', loggedOutNotAllowed, function(req, res){
  res.render('play', {
    title: 'Rock, Paper, Scissors, Node!: Play'
  });
});

app.listen(3000);
console.log("Express server listening on port %d", app.address().port);


// socket.io, I choose you
var socket = io.listen(app);

//Here's the juicy stuff
var Game = {}

//We need this countdown here to have a timeout based timer,
//and a way to cancel this timeout timer
function Countdown() {
  self = this
  //Timer is the actual act of counting down
  self.timer = function(seconds, callback) {
    setTimeout(function() {
      callback(seconds);
      if (seconds===0) {
        return
      }
      self.timer(seconds-1, callback);
    }, 1000);
  }
}

//tim_smart in IRC offered this solution:
//This solution reduces function reference counts on the heap. Implement this tomorrow.
/*
function Countdown(seconds) {
  this.seconds = seconds
}

Countdown.prototype._tick = function (seconds, callback) {
  var countdown = this

  setTimeout(function () {
    callback(seconds)

    if (seconds <= 0) {
      return
    }

    countdown._tick(seconds - 1, callback)
  }, 1000)

  return this
}

Countdown.prototype.start = function (callback) {
  return this._tick(this.seconds, callback)
}

var countdown = new Countdown(5)
countdown.start(function (seconds_left) {
  console.log(seconds_left)
})
*/

socket.on('connection', function(client){
  console.log('User ' + client.sessionId + ' has connected');
  client.on('message', function(msg){ 
    //When a player clicks on /play, they send a 'search' message to the
    //server
    if (msg.type==='search') {
      /////
      //Game Initialization
      /////
      //If there isn't a game already, create one, then tell the clien to
      //wait
      if (!Game.player1) {
        Game.player1 = client
        client.username = msg.data
        client.game = Game
        client.send({type: 'wait', data: 'Waiting for opponent'});
        console.log('Player 1 initialized as ' + msg.data);
      } else { //If there is a game, have this player join the game, and then
      //free up the Game variable for the next client pair
        Game.player2 = client
        client.username = msg.data
        console.log('Player 2 initialized as ' + msg.data);
        client.game = Game
        client.send({type: 'join', data: {player1name: client.game.player1.username, player2name: client.game.player2.username}})
        client.send({type: 'gamestatus', data: 'Game is about to begin!'})
        client.game.player1.send({type: 'join', data: {player1name: client.game.player1.username, player2name: client.game.player2.username}})
        client.game.player1.send({type: 'gamestatus', data: 'Game is about to begin!'})
        Game = {}
      }
    } else if (msg.type==='ready') {
      //Now, since we're at this point, we assume both players are
      //ready to go. Just in case, though, we'll give them 5 seconds
      //to collect their thoughts
      console.log('One of the players is ready');
      var newCountdown = new Countdown();
      newCountdown.timer(5, function(seconds) {
        client.send({type: 'timer', data: seconds});
        //If the seconds is 1, then we'll start the game timer (3 seconds)
        if (seconds===0) {
          newCountdown.timer(3, function(seconds) {
            //If the seconds are not at 0 yet, just send back the number
            if(seconds!==0) {
              client.send({type: 'timer', data: seconds});
            } else { //Else, it's go time. Check the user choices, and
            //determine the winner
              client.send({type: 'gamestatus', data: 'SHOOT!'});
            }
          });
        }
      });
    }
  })
  client.on('disconnect', function(){  })
});


