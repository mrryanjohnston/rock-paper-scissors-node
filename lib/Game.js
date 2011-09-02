var Game = exports.Game = function() {
  var player1;
  var player2;
}

Game.prototype.setPlayer1 = function(socket) {
  this.player1 = socket;
  socket.game = this;
}

Game.prototype.setPlayer2 = function(socket) {
  this.player2 = socket;
  socket.game = this;
}

Game.prototype.joinGame = function(socket, callback) {
  if(!player1.length) {
    this.setPlayer1(socket);
    callback(this);
  } else {
    this.setPlayer2(socket);
    callback(this);
  }
}

Game.prototype.emittoboth = function(event, payload) {
  this.player1.emit(event, payload);
  this.player2.emit(event, payload);
}

Game.prototype.makeChoice(socket, choice) {
  socket.choice = choice;
}

Game.prototype.timer = function(seconds, callback) {
  seconds || (seconds = 5)
  
  var timerInterval = setInterval(function() {
    if (--seconds==0) {
      clearInterval(timerInterval);
      callback();
  }, 1000);  
}

/**
 * Returns an object with properties:
 * winner: which player won
 * player1: object with database entries to enter
 * player2: object with database entries to enter
 * 
 * for example:
 * { winner: 'player2', player1: [ rock, losses ], player2: [ paper, wins ] } 
 */
Game.prototype.determinewinner = function(callback) {
  var self = this;
  switch (self.player1.choice) {
    case 'rock':
      switch (self.player2.choice) {
        case 'rock':
          callback({
                  winner: 'tie'
                  , player1: ['rocks']
                  , player2: ['rocks']
                 });
          break;
        case 'paper':
          callback({
                  winner: 'player2'
                  , player1: ['rocks', 'losses']
                  , player2: ['papers', 'wins']
                 });
          break;
        case 'scissors':
          callback({
                  winner: 'player1'
                  , player1: ['rocks', 'wins']
                  , player2: ['scissors', 'losses']
                 });
          break;
        default:
          callback({
                  winner: 'player1'
                  , player1: ['rocks', 'wins']
                  , player2: ['losses']
                 });
          //Opponent didn't make a choice
          break;
      }
      break;
    
    case 'paper':
      switch (self.player2.choice) {
        case 'rock':
          callback({
                  winner: 'player1'
                  , player1: ['papers', 'wins']
                  , player2: ['rocks', 'losses']
                 });
          break;
        case 'paper':
          callback({
                  winner: 'tie'
                  , player1: ['papers']
                  , player2: ['papers']
                 });
          break;
        case 'scissors':
          callback({
                  winner: 'player2'
                  , player1: ['papers', 'losses']
                  , player2: ['scissors', 'wins']
                 });
          break;
        default:
          callback({
                  winner: 'player1'
                  , player1: ['papers', 'wins']
                  , player2: ['losses']
                 });
          //Opponent didn't make a choice
          break;
      }
      break;
    
    case 'scissors':
      switch (self.player2.choice) {
        case 'rock':
          callback({
                  winner: 'player2'
                  , player1: ['scissors', 'losses']
                  , player2: ['rocks', 'wins']
                 });
          break;
        case 'paper':
          callback({
                  winner: 'player1'
                  , player1: ['scissors', 'wins']
                  , player2: ['papers', 'losses']
                 });
          break;
        case 'scissors':
          callback({
                  winner: 'tie'
                  , player1: ['scissors']
                  , player2: ['scissors']
                 });
          break;
        default:
          callback({
                  winner: 'player1'
                  , player1: ['scissors', 'wins']
                  , player2: ['losses']
                 });
          //Opponent didn't make a choice
          break;
      }
      break;
    default:
      //This client didn't make a choice
      switch (self.player2.choice) {
        case 'rock':
          callback({
                  winner: 'player2'
                  , player1: ['losses']
                  , player2: ['rocks', 'wins']
                 });
         break;
        case 'paper':
          callback({
                  winner: 'player2'
                  , player1: ['losses']
                  , player2: ['papers', 'wins']
                 });
          break;
        case 'scissors':
          callback({
                  winner: 'player2'
                  , player1: ['losses']
                  , player2: ['scissors', 'wins']
                 });
          break;
        default:
          callback({
                  winner: 'tie'
                  , player1: ['losses']
                  , player2: ['losses']
                 });
           break;
      }
      break;
  }
}

Game.prototype.resultsWithRounds = function(stats, callback) {
  var self = this;
  var player1stats = stats.player1;
  var player2stats = stats.player2;
  if(self.player1.roundplay) {
    player1stats.forEach(function(stat) {
      stats.player1.push('round'+stat);
    });
  }
  if(self.player2.roundplay) {
    player2stats.forEach(function(stat) {
      stats.player2.push('round'+stat);
    });
  }
  callback(stats);
}

Game.prototype.updateStats = function(User, stats) {
  var self = this;
  User.find({displayName: { $in: [self.player1.displayName, self.player2.displayName]}}, function(err,users) {    
    users.forEach(function(user) {
      if(user.roundplays>0) {
        user.roundplayes--;
      }
      stats.forEach(function(stat) {
        user[stat]++;
      });
      user.save(function(err) {
        if(err) {throw err;}
      });
    });
  });
  
}
