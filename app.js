
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

socket.on('connection', function(client){
  console.log('User ' + client.sessionId + ' has connected');
  client.on('message', function(msg){ 
    //When a player clicks on /play, they send a 'search' message to the
    //server
    if (msg.type==='search') {
      /////
      //Game Initialization
      /////
      //If there isn't a game already, create one, then tell the client to
      //wait
      if (!Game.player1) {
        Game.player1 = client
        client.username = msg.data
        client.game = Game
        client.choice = client.game.player1choice = {} //This will be the player's choice
        client.send({type: 'wait', data: 'Waiting for opponent'});
        console.log('Player 1 initialized as ' + msg.data);
      } else { //If there is a game, have this player join the game, and then
      //free up the Game variable for the next client pair
        Game.player2 = client
        client.username = msg.data
        console.log('Player 2 initialized as ' + msg.data);
        client.game = Game
        client.choice = client.game.player2choice = {} //This will be the player's choice
        client.send({type: 'join', data: {player1name: client.game.player1.username, player2name: client.game.player2.username}})
        client.send({type: 'gamestatus', data: 'Game is about to begin!'})
        client.game.player1.send({type: 'join', data: {player1name: client.game.player1.username, player2name: client.game.player2.username}})
        client.game.player1.send({type: 'gamestatus', data: 'Game is about to begin!'})
        
        client.game.timer = function(seconds, callback, next) {
          var self = this;
          self.player1.send({type: 'timer', data: seconds})
          self.player2.send({type: 'timer', data: seconds})
          if (seconds === 0) {
            next.call(self);
          } else {
              setTimeout(function() {
                callback.call(self, --seconds, callback, next);
              }, 1000);
          }
        }
        client.game.sendtoboth = function(msg) {
          self = this
          self.player1.send(msg);
          self.player2.send(msg);
        }
        client.game.determinewinner = function(callback) {
              switch (self.player1choice.choice) {
                case 'rock':
                  switch (self.player2choice.choice) {
                    case 'rock':
                      //Tie. Reshoot
                      self.player1.send({type: 'gamestatus', data: 'Tie! Reshoot in 5 seconds!'});
                      self.player2.send({type: 'gamestatus', data: 'Tie! Reshoot in 5 seconds!'});
                      break;
                    case 'paper':
                      //Player1 loses
                      self.player1.send({type: 'gamestatus', data: self.player2.username + ' wins!'});
                      self.player2.send({type: 'gamestatus', data: self.player2.username + ' wins!'});
                      //Probably a nicer way to do this
                      self.player2.win = 1
                      self.player2.lose = 0
                      self.player1.win = 0
                      self.player1.lose = 1
                      break;
                    case 'scissors':
                      //Player1 wins
                      self.player1.send({type: 'gamestatus', data: self.player1.username + ' wins!'});
                      self.player2.send({type: 'gamestatus', data: self.player1.username + ' wins!'});
                      self.player1.win = 1
                      self.player1.lose = 0
                      self.player2.win = 0
                      self.player2.lose = 1
                      break;
                    default:
                      //Opponent didn't make a choice
                      self.player1.send({type: 'gamestatus', data: self.player1.username + ' wins by default! ' + self.player2.username + ' didn\'t choose!'});
                      self.player2.send({type: 'gamestatus', data: self.player1.username + ' wins by default! ' + self.player2.username + ' didn\'t choose!'});
                      self.player1.win = 1
                      self.player1.lose = 0
                      self.player2.win = 0
                      self.player2.lose = 1
                      break;
                  }
                  break;
                
                case 'paper':
                  switch (self.player2choice.choice) {
                    case 'rock':
                      //Player1 wins
                       self.player1.send({type: 'gamestatus', data: self.player1.username + ' wins!'});
                       self.player2.send({type: 'gamestatus', data: self.player1.username + ' wins!'});
                      self.player1.win = 1
                      self.player1.lose = 0
                      self.player2.win = 0
                      self.player2.lose = 1
                      break;
                    
                    case 'paper':
                      //Tie. Reshoot
                       self.player1.send({type: 'gamestatus', data: 'Tie! Reshoot in 5 seconds!'});
                       self.player2.send({type: 'gamestatus', data: 'Tie! Reshoot in 5 seconds!'});
                      break;
                    
                    case 'scissors':
                      //Player1 loses
                       self.player1.send({type: 'gamestatus', data: self.player2.username + ' wins!'});
                       self.player2.send({type: 'gamestatus', data: self.player2.username + ' wins!'});
                      self.player2.win = 1
                      self.player2.lose = 0
                      self.player1.win = 0
                      self.player1.lose = 1
                      break;
                    
                    default:
                      //Opponent didn't make a choice
                       self.player1.send({type: 'gamestatus', data: self.player1.username + ' wins by default! ' + self.player2.username + ' didn\'t choose!'});
                       self.player2.send({type: 'gamestatus', data: self.player1.username + ' wins by default! ' + self.player2.username + ' didn\'t choose!'});
                      self.player1.win = 1
                      self.player1.lose = 0
                      self.player2.win = 0
                      self.player2.lose = 1
                      break;
                  }
                  break;
                
                case 'scissors':
                  switch (self.player2choice.choice) {
                    case 'rock':
                      //Player1 loses
                      self.player1.send({type: 'gamestatus', data: self.player2.username + ' wins!'});
                      self.player2.send({type: 'gamestatus', data: self.player2.username + ' wins!'});
                      self.player2.win = 1
                      self.player2.lose = 0
                      self.player1.win = 0
                      self.player1.lose = 1
                      break;
                    
                    case 'paper':
                      //Player1 wins
                      self.player1.send({type: 'gamestatus', data: self.player1.username + ' wins!'});
                      self.player2.send({type: 'gamestatus', data: self.player1.username + ' wins!'});
                      self.player1.win = 1
                      self.player1.lose = 0
                      self.player2.win = 0
                      self.player2.lose = 1
                      break;
                    
                    case 'scissors':
                      //Tie. Reshoot
                      self.player1.send({type: 'gamestatus', data: 'Tie! Reshoot in 5 seconds!'});
                      self.player2.send({type: 'gamestatus', data: 'Tie! Reshoot in 5 seconds!'});
                      break;
                    
                    default:
                      //Opponent didn't make a choice
                      self.player1.send({type: 'gamestatus', data: self.player1.username + ' wins by default! ' + self.player2.username + ' didn\'t choose!'});
                      self.player2.send({type: 'gamestatus', data: self.player1.username + ' wins by default! ' + self.player2.username + ' didn\'t choose!'});
                      self.player1.win = 1
                      self.player1.lose = 0
                      self.player2.win = 0
                      self.player2.lose = 1
                      break;
                  }
                  break;
                default:
                  //This client didn't make a choice
                  switch (self.player2choice.choice) {
                    case null:
                      //Neither player made a choice
                       self.player1.send({type: 'gamestatus', data: 'No one wins! Neither chose!'});
                       self.player2.send({type: 'gamestatus', data: 'No one wins! Neither chose!'});
                       self.player2.win = 0
                       self.player2.lose = 1
                       self.player1.win = 0
                       self.player1.lose = 1
                       break;
                    default:
                      //Player1 didn't make a choice
                      self.player1.send({type: 'gamestatus', data: self.player2.username + ' wins by default! ' + self.player1.username + ' didn\'t choose!'});
                      self.player2.send({type: 'gamestatus', data: self.player2.username + ' wins by default! ' + self.player1.username + ' didn\'t choose!'});
                      self.player2.win = 1
                      self.player2.lose = 0
                      self.player1.win = 0
                      self.player1.lose = 1
                      break;
                  }
                  break;
              }
               self.player1.send({type: 'results', data: {player1choice: client.game.player1choice.choice, player2choice: client.game.player2choice.choice}});
               self.player2.send({type: 'results', data: {player1choice: client.game.player1choice.choice, player2choice: client.game.player2choice.choice}});
               callback({'username': self.player1.username, 'win': self.player1.win, 'lose': self.player1.lose}, {'username': self.player2.username, 'win': self.player2.win, 'lose': self.player2.lose});
            }
            Game = {}
            
            //Ok, Finally, we do the game.
            client.game.timer(5, client.game.timer, function() {
              //Initial 5 seconds is over. Time for the players to make a choice
              client.game.sendtoboth({type: 'gamestatus', data: 'Choose your play!'});
              client.game.timer(3, client.game.timer, function() {
                client.game.determinewinner(function(player1, player2) {
                  //Save the two players here
                  User.findOne({username: player1.username}, function (err, user) {
                    if (err) { throw err; }
                    if (user) {
                      //Update player1's stats here
                      user.wins += player1.win
                      user.losses += player1.lose
                      user.save(function (err) {
                      if (err) { throw err; }
                        console.log('saved')
                      });
                    }
                    User.findOne({username: player2.username}, function (err, user) {
                      if (err) { throw err; }
                      if (user) {
                        //Update player2's stats here
                        user.wins += player2.win
                        user.losses += player2.lose
                        user.save(function (err) {
                         if (err) { throw err; }
                          console.log('saved')
                        });
                      }
                    });
                  });
                });
              });
            });
        }
      } else if (msg.type==='choice') { //If the user is choosing which hand to play
        console.log(client.username + " chose " + msg.data)
        if (msg.data === 'rock' || msg.data === 'paper' || msg.data === 'scissors') {
          client.choice.choice = msg.data // come up with a better name for ".choice.choice"
          console.log('and it was accepted.')
        }
      }
    });
  client.on('disconnect', function(){  })
});

//tim_smart in IRC offered this solution:
//This solution reduces function reference counts on the heap. Implement this tomorrow.
/*
function Countdown(seconds) {
  this.seconds = seconds
  this._ms     = null
}

Countdown.prototype._tick = function (seconds, callback, ms) {
  var countdown = this
    , timestamp = new Date().getTime()

  ms       || (ms       = 1000)
  this._ms || (this._ms = seconds * 1000)

  setTimeout(function () {
    var taken     = new Date().getTime() - timestamp
      , total_ms  = seconds * 1000
      , new_ms    = countdown._ms - taken
      , diff      = total_ms - new_ms
      , secs_diff = Math.floor(diff / 1000)
      , next

    countdown._ms = new_ms

    for (var i = 0; i < secs_diff; i++) {
      callback(--seconds)
      if (seconds === 0) {
        countdown._ms = null
        return
      }
    }

    next = diff >= 1000
         ? 1000 - (diff % 1000)
         : 1000 - diff

    countdown._tick(seconds, callback, next)
  }, ms)

  return this
}

Countdown.prototype.start = function (callback) {
  callback(this.seconds)
  return this._tick(this.seconds, callback)
}

var countdown = new Countdown(5)

countdown.start(function (seconds_left) {
  console.log(seconds_left)
})
*/
