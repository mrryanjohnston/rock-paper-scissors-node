
/**
 * Module dependencies.
 */

var express  = require('express'),
    mongoose = require('mongoose'),
    models   = require('./models'),
    bcrypt   = require('bcrypt'),
    dnode    = require('dnode'),
    User,
    Games;

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

var server = dnode({
  test: function(callback) {
    callback('Test');
  },
  createGame: function (username, callback) {
    var newGame = new Game();
    newGame.gameID  = Date.now();
    console.log(username + " created a game");
    newGame.player1 = username;
    newGame.status  = 'Waiting';
    newGame.save(function (err) {
      if (err) { throw err; }
        //Game created
        callback('Waiting for opponent');
    });
  }
});
server.listen(app);
console.log("Express server listening on port %d", app.address().port);


// socket.io, I choose you
//var socket = io.listen(app);

//Here's the juicy stuff

/*socket.on('connection', function(client){
  console.log('User ' + client.sessionid + ' has connected');
  client.on('message', function(data){ 
    //A connection type is sent when the user first loads the /play page
    if (data.type==='connection') {
      //If the user is in a game
      if (false) {
        
      } else {
        //Look for a game
        Game.findOne({status: 'Waiting'}, function (err, game) {
          if (err) { throw err; }
          //If game is waiting
          if (game) {
            game.player2 = data.payload;
            game.status  = 'Playing';
            game.save(function(err) {
              if (err) { throw err; }
              client.send('You joined game ' + game.gameID);
            });
          } else {
            //Create a new game
            var newGame = new Game();
            newGame.gameID  = Date.now();
            console.log(data.payload);
            newGame.player1 = data.payload;
            newGame.status  = 'Waiting';
            newGame.save(function (err) {
              if (err) { throw err; }
                //Game created
                client.send('Waiting for opponent');
            });
          }
        });
      }
    }
  })
  client.on('disconnect', function(){  })
});*/


