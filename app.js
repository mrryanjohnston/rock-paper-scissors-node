/**
 * Module dependencies.
 */

var express      = require('express'),
    mongoose     = require('mongoose'),
    bcrypt       = require('bcrypt'),
    User,
    sanitizer    = require('sanitizer'),
    everyauth    = require('everyauth'),
    Promise      = everyauth.Promise,
    mongooseAuth = require('mongoose-auth'),
    bcrypt       = require('bcrypt'),
    conf         = require('./conf');
    
everyauth.debug = true;

var app = module.exports = express.createServer(),
    io  = require('socket.io').listen(app);
    
var Schema = mongoose.Schema
, ObjectId = mongoose.SchemaTypes.ObjectId;


var User = new Schema({
    displayName    : {type: String, default: null}
    , wins         : {type: Number, default: 0}
    , losses       : {type: Number, default: 0}
    , rocks        : {type: Number, default: 0}
    , papers       : {type: Number, default: 0}
    , scissors     : {type: Number, default: 0}
});

User.plugin(mongooseAuth, {
    everymodule: {
      everyauth: {
          User: function () {
            return User;
          }
      }
    }
  , password: {
        loginWith: 'email'
      , everyauth: {
            getLoginPath: '/login'
          , postLoginPath: '/login'
          , loginView: 'login.jade'
          , getRegisterPath: '/register'
          , postRegisterPath: '/register'
          , registerView: 'register.jade'
          , loginSuccessRedirect: '/'
          , registerSuccessRedirect: '/'
        }
    }
  , twitter: {
      everyauth: {
          myHostname: 'http://dev.rockpaperscissors.nodester.com:3000'
        , consumerKey: conf.twit.consumerKey
        , consumerSecret: conf.twit.consumerSecret
        , redirectPath: '/'
      }
    }
  , github: {
      everyauth: {
          myHostname: 'http://dev.rockpaperscissors.nodester.com:3000'
        , appId: conf.github.appId
        , appSecret: conf.github.appSecret
        , redirectPath: '/'
      }
    }
});

mongoose.model('User', User);
mongoose.connect('mongodb://localhost/db');
User = mongoose.model('User');
  
    

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'your secret here' }));
  app.use(mongooseAuth.middleware());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

//Dynamic Helpers
app.dynamicHelpers({
  info: function(req, res){
    return req.flash('info');
  },
  warn: function(req, res){
    return req.flash('warn');
  },
});

//Route Middleware

function loggedInNotAllowed(req, res, next) {
  if (req.loggedIn) {
    res.redirect('/');
  } else {
    next();
  }
}

function userMustBeLoggedIn(req, res, next) {
  if (!req.loggedIn) {
    res.redirect('/');
  } else {
    next();
  }
}

function isdisplayNameTaken(req, res, next) {
  User.findOne({displayName: req.body.displayName}, function (err, user) {
    if (err) { throw err; }
    if (!user) {
      next();
    } else {
      req.flash('warn', 'displayName already taken!');
      res.redirect('/register');
    }
  });
}

function userMustHaveDisplayName(req, res, next) {
  if (req.user) {
    if (!req.user.displayName) {
      req.flash('info', 'Please choose a display name to display to your enemies in BATTLE!');
      res.redirect('/newuser');
    } else {
      next();
    }
  } else {
    next();
  }
}

// Routes

app.get('/', userMustHaveDisplayName, function(req, res){
  res.render('index', {
    title: 'Rock, Paper, Scissors, Node!'
  });
});

app.get('/newuser', function(req, res){
  res.render('newuser', {
    title: 'Rock, Paper, Scissors, Node!: New User'
  });
});

app.post('/newuser', function(req, res){
  //First, display name must be more than 0 characters.
  if (req.body.displayname.length > 0) {
    //Second, display name should be unique
    User.find({ displayName: req.body.displayname }, function(err, user) {
      if (err) {throw err;}
      //If we don't find someone else with this display name
      if (!user.length) {
        //Find this currently logged in user
        User.findById(req.user._id, function(err, user) {

          if(err) { throw err; }
          
          user.displayName = req.body.displayname;
          req.user.displayName = req.body.displayname;
          user.save(function(err) {
            if (err) { throw err; }
            req.flash('info', 'Creation of Display Name Successful!');
            res.redirect('/');
          });
        });
      } else {
        req.flash('warn', 'Display name already taken. Try again.');
        res.redirect('/newuser');
      } //End of if name not unique
    }); //End of finding unique display name
  } else {
      req.flash('warn', 'Display name must be at least 1 character long. Try again.');
      res.redirect('/newuser');
  } //End of display name being more than 0 chars
});

app.get('/play', userMustHaveDisplayName, userMustBeLoggedIn, function(req, res){
  res.render('play', {
    title: 'Rock, Paper, Scissors, Node!: Play'
  });
});

app.get('/stats', userMustHaveDisplayName, function(req, res){
  User.find({}).sort('wins', -1).limit(25).execFind(function(err, foundusers) {
    if (err) { throw err; }
    if (foundusers) {
      res.render('stats', {
        title: 'Rock, Paper, Scissors, Node!: Stats',
        foundusers: foundusers
      });
    } else {
      req.flash('warn', 'No users found! Yet... ');
      res.redirect('/');
    }
  });
});


app.get('/stats/:displayName', userMustHaveDisplayName, function(req, res){
  User.findOne({displayName: sanitizer.escape(req.params.displayName)}, function(err, founduser) {
    if (err) { throw err; }
    if (founduser) {
      res.render('stats/individualstats', {
        title: 'Rock, Paper, Scissors, Node!: Stats',
        founduser: founduser
      });
    } else {
      req.flash('warn', 'No user ' + sanitizer.escape(req.params.displayName) + ' was found!');
      res.redirect('stats');
    }
  });
});

mongooseAuth.helpExpress(app);

app.listen(3000);
console.log("Express server listening on port %d", app.address().port);


//Here's the juicy stuff
var Game = {}

io.sockets.on('connection', function(socket){
  //First off, we can grab their name from a socket emission
  socket.on('initial', function(msg){
    console.log('User ' + socket.id + ' has connected as ' + msg.data);
    /////
    //Game Initialization
    /////
    //If there isn't a game already, create one, then tell the client to
    //wait
    //Or, if player1 hits refresh, just put them back to the Game.player1 property
    if (!Game.player1 || Game.player1.displayName===msg.data) {
      Game.player1 = socket
      socket.displayName = msg.data
      socket.game = Game
      socket.choice = socket.game.player1choice = {} //This will be the player's choice
      socket.emit('wait',{data: 'Waiting for opponent'});
      console.log(socket.displayName + ' is player 1');
    } else { //If there is a game, have this player join the game, and then
    //free up the Game variable for the next client pair
      Game.player2 = socket
      socket.displayName = msg.data
      console.log(socket.displayName + ' is player 2');
      socket.game = Game
      socket.choice = socket.game.player2choice = {} //This will be the player's choice
      socket.emit('join',{data: {player1name: socket.game.player1.displayName, player2name: socket.game.player2.displayName}});
      socket.emit('gamestatus', {data: 'Game is about to begin!'});
      socket.game.player1.emit('join', {data: {player1name: socket.game.player1.displayName, player2name: socket.game.player2.displayName}})
      socket.game.player1.emit('gamestatus', {data: 'Game is about to begin!'})
      
      //Does the timer stuff for the game
      socket.game.timer = function(seconds, callback, next) {
        var self = this;
        self.player1.emit('timer', {data: seconds})
        self.player2.emit('timer', {data: seconds})
        if (seconds === 0) {
          next.call(self);
        } else {
            setTimeout(function() {
              callback.call(self, --seconds, callback, next);
            }, 1000);
        }
      }
      
      //Emits to both players
      socket.game.emittoboth = function(msg, data) {
        self = this
        self.player1.emit(msg, data);
        self.player2.emit(msg, data);
      }
      
      //Determines the winner of the game
      socket.game.determinewinner = function(callback) {
            switch (self.player1choice.choice) {
              case 'rock':
                switch (self.player2choice.choice) {
                  case 'rock':
                    //Tie. Reshoot
                    self.emittoboth('gamestatus', { data: 'Tie! Reshoot in 5 seconds!'});
                    self.player2.win = 0
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 0
                    break;
                  case 'paper':
                    //Player1 loses
                    self.emittoboth('gamestatus', { data: self.player2.displayName + ' wins!'});
                    //Probably a nicer way to do this
                    self.player2.win = 1
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 1
                    break;
                  case 'scissors':
                    //Player1 wins
                    self.emittoboth('gamestatus', { data: self.player1.displayName + ' wins!'});
                    self.player1.win = 1
                    self.player1.lose = 0
                    self.player2.win = 0
                    self.player2.lose = 1
                    break;
                  default:
                    //Opponent didn't make a choice
                    self.emittoboth('gamestatus', { data: self.player1.displayName + ' wins by default! ' + self.player2.displayName + ' didn\'t choose!'});
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
                    self.emittoboth('gamestatus', { data: self.player1.displayName + ' wins!'});
                    self.player1.win = 1
                    self.player1.lose = 0
                    self.player2.win = 0
                    self.player2.lose = 1
                    break;
                  
                  case 'paper':
                    //Tie. Reshoot
                    self.emittoboth('gamestatus', { data: 'Tie! You are awarded no points!'});
                    self.player2.win = 0
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 0
                    break;
                  
                  case 'scissors':
                    //Player1 loses
                    self.emittoboth('gamestatus', { data: self.player2.displayName + ' wins!'});
                    self.player2.win = 1
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 1
                    break;
                  
                  default:
                    //Opponent didn't make a choice
                    self.emittoboth('gamestatus', { data: self.player1.displayName + ' wins by default! ' + self.player2.displayName + ' didn\'t choose!'});
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
                    self.emittoboth('gamestatus', { data: self.player2.displayName + ' wins!'});
                    self.player2.win = 1
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 1
                    break;
                  
                  case 'paper':
                    //Player1 wins
                    self.emittoboth('gamestatus', { data: self.player1.displayName + ' wins!'});
                    self.player1.win = 1
                    self.player1.lose = 0
                    self.player2.win = 0
                    self.player2.lose = 1
                    break;
                  
                  case 'scissors':
                    //Tie. Reshoot
                    self.emittoboth('gamestatus', { data: 'Tie! Reshoot in 5 seconds!'});
                    self.player2.win = 0
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 0
                    break;
                  
                  default:
                    //Opponent didn't make a choice
                    self.emittoboth('gamestatus', { data: self.player1.displayName + ' wins by default! ' + self.player2.displayName + ' didn\'t choose!'});
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
                  case undefined:
                    //Neither player made a choice
                     self.emittoboth('gamestatus', { data: 'No one wins! Neither chose!'});
                     self.player2.win = 0
                     self.player2.lose = 1
                     self.player1.win = 0
                     self.player1.lose = 1
                     break;
                  default:
                    //Player1 didn't make a choice
                    self.emittoboth('gamestatus', { data: self.player2.displayName + ' wins by default! ' + self.player1.displayName + ' didn\'t choose!'});
                    self.player2.win = 1
                    self.player2.lose = 0
                    self.player1.win = 0
                    self.player1.lose = 1
                    break;
                }
                break;
            }
             self.emittoboth('results', { data: {player1choice: socket.game.player1choice.choice, player2choice: socket.game.player2choice.choice}});
             callback({'displayName': self.player1.displayName, 'win': self.player1.win, 'lose': self.player1.lose}, {'displayName': self.player2.displayName, 'win': self.player2.win, 'lose': self.player2.lose});
          }
          Game = {}
            
          //Ok, Finally, we do the game. This is the actual game execution
          socket.game.timer(5, socket.game.timer, function() {
            //Initial 5 seconds is over. Time for the players to make a choice
            socket.game.emittoboth('gamestatus', { data: 'Choose your play!'});
            socket.game.emittoboth('choose');
            socket.game.timer(3, socket.game.timer, function() {
              socket.game.determinewinner(function(player1, player2) {
                //Save the two players here
                User.findOne({displayName: player1.displayName}, function (err, user) {
                  if (err) { throw err; }
                  if (user) {
                    console.log(user)
                    //Update player1's stats here
                    user.wins += player1.win;
                    user.losses += player1.lose;
                    user.save(function (err) {
                      if (err) { throw err; }
                      console.log('saved');
                    });
                  }
                  User.findOne({displayName: player2.displayName}, function (err, user) {
                    if (err) { throw err; }
                    if (user) {
                      //Update player2's stats here
                      user.wins += player2.win;
                      user.losses += player2.lose;
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
      });
      socket.on('choice', function(msg){
        console.log(socket.displayName + " chose " + msg.data)
        if (msg.data === 'rock' || msg.data === 'paper' || msg.data === 'scissors') {
          socket.choice.choice = msg.data // come up with a better name for ".choice.choice"
          console.log('and it was accepted.')
          //Send it back to the user for display purposes
          if (socket===socket.game.player1) {
            socket.emit('initialchoice', { data: { playerchoicediv: '#player1choice', playerchoice: msg.data } });
          } else {
            socket.emit('initialchoice', { data: { playerchoicediv: '#player2choice', playerchoice: msg.data } });
          }
        }
      });
  socket.on('disconnect', function(){  })
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

