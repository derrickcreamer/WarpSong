var express = require('express');
var knex = require('knex');
var expressSession = require('express-session');
var knexSessionStore = require('connect-session-knex')(expressSession);
var bodyParser = require('body-parser');
var scrypt = require('scrypt-for-humans');
var csurf = require('csurf');
var ent = require('ent'); //todo: this isn't needed because of jade, right?
var path = require('path');
var Promise = require('bluebird');

var app = express();
var expressWs = require('express-ws')(app);

var activeConnections = { };

var db = knex({
	client: 'sqlite3',
	connection: {
		filename: path.join(__dirname, 'warpsong.sqlite3')
	},
	useNullAsDefault: true
});

//Promise.try(() => scrypt.hash('fakepassword'))
//	.then(hash => db('users').insert({
//		name: 'fakeadmin',
//		hash: hash
//	}));
	//.then(() => db('users').del());


app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'pug');

app.use(expressSession({
	secret: 'changeThisLater', //todo
	resave: false,
	saveUninitialized: false,
	cookie: { maxAge: 50000000000 }, // 50 billion ms is just over a year and a half.
	store: new knexSessionStore({
		knex: db
	})
}));

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/static', express.static(path.join(__dirname, '/static')));

app.get('/login', (req, res) => res.render('login'));

app.get('/register', (req, res) => res.render('register'));

app.post('/login', (req, res) => {
	Promise.try(() => db('users').where({ name: req.body.name }))
	.then(users => {
		if(users.length == 0) res.render('login'); //todo, is this right? This part should give a generic "username or password incorrect" message, right?
		else{
			Promise.try(() => scrypt.verifyHash(req.body.pw, users[0].hash))
			.then(() => {
				req.session.userID = users[0].id; // Login successful
				res.redirect('/');
			})
			.catch(scrypt.PasswordError, err => res.render('login')); //todo, same generic error as above.
		}
	});
});

app.post('/register', (req, res) => {
	if(req.body.pw.length < 4) res.render('register'); //todo, error message
	else if(req.body.name.length < 2) res.render('register'); //todo, add message
	else if(req.body.pw !== req.body.confirmPw) res.render('register'); //todo, add message
	//todo: combine all error messages and display as many as possible.
	else{ //todo, valid chars, etc.
		Promise.all([
			() => scrypt.hash(req.body.pw),
			() => db('users').where({ name: req.body.name })
			].map(x => Promise.try(x))
		).then(results => {
			var hash = results[0];
			var users = results[1];
			if(users.length > 0) res.render('register'); //todo, "username is taken"
			else{ // registration successful
				Promise.try(() => db('users').insert({ name: req.body.name, hash: hash }))
				.then(() => db('users').where({ name: req.body.name }))
				.then(justInsertedUsers => {
					var justInsertedUser = justInsertedUsers[0];
					req.session.userID = justInsertedUser.id; // Log in
					//todo: temp message: "account created!"
					res.redirect('/');
				});
			}
		});
	}
});

app.use('/', (req, res, next) =>{
	if(!req.session.userID) res.redirect('/login');
	else{
		Promise.try(() => db('users').where({ id: req.session.userID }))
		.then(users => {
			if(users.length == 0){
				req.session.destroy();
				res.redirect('/login');
			}
			else{
				req.session.username = users[0].name;
				next();
			}
		});
	}
});

function getActiveConnection(session){
	if(activeConnections[session.userID]){ // Check whether this user has any active connections...
		return activeConnections[session.userID][session.id]; // ...for this session.
	}
	else return null;
}

function closeActiveConnection(session){
	if(activeConnections[session.userID]){
		var ws = activeConnections[session.userID][session.id];
		if(ws){ // Close, then remove any existing connection for this session.
			ws.close();
			delete activeConnections[session.userID][session.id];
		}
	}
}

app.get('/reconnect', function(req, res){
	if(!getActiveConnection(req.session)) res.redirect('/'); // If there's no active connection, go back to the homepage.
	else res.render('reconnect');
});

app.post('/reconnect', function(req, res){
	closeActiveConnection(req.session);
	res.redirect('/');
});

app.get('/', function(req, res){
	if(getActiveConnection(req.session)) res.redirect('/reconnect'); // Offer to let them reconnect, if there's an active connection already.
	else res.render('index');
});

function schedulePings(interval){
	setTimeout(() => {
		pingAll();
		schedulePings(interval);
	}, interval);
}

function ping(ws){
	ws.send(JSON.stringify({ type: 'ping' }));
}

function pingAll(){
	var any = false;
	for(var userID in activeConnections){
		any = true;
		for(var sessionID in activeConnections[userID]){
			ping(activeConnections[userID][sessionID]);
		}
	}
	if(any)	setTimeout(pingCheck, 5000);
}

function pingCheck(){
	for(var userID in activeConnections){
		pingCheckForUser(userID);
	}
}

function pingAllForUser(userID, currentSessionID){
	var userConnections = activeConnections[userID];
	if(userConnections){
		for(var sessionID in userConnections){
			if(sessionID != currentSessionID){
				ping(userConnections[sessionID]);
			}
		}
		setTimeout(() => pingCheckForUser(userID), 5000);
	}
}

function pingCheckForUser(userID){
	var userConnections = activeConnections[userID];
	if(userConnections){
		var changed = false;
		for(var sessionID in userConnections){
			var ws = userConnections[sessionID];
			if(Date.now() - ws.lastCommunicationTime > 5500){ // 5.5 seconds
				closeActiveConnection(sessionID);
				changed = true;
			}
		}
		if(changed){
			broadcastActiveConnectionCount(userID);
		}
	}
}

function activeConnectionCount(userID){
	var userConnections = activeConnections[userID];
	if(userConnections) return Object.keys(userConnections).length;
	else return 0;
}

function broadcastActiveConnectionCount(userID){
	var count = activeConnectionCount(userID);
	var userConnections = activeConnections[userID];
	if(userConnections){
		for(var sessionID in userConnections){
			userConnections[sessionID].send(JSON.stringify({ type: 'connectionCount', count: count }));
		}
	}
}

app.ws('/', function(ws, req){
	ws.on('close', e => {
		closeActiveConnection(req.session);
		broadcastActiveConnectionCount(req.session.userID);
	});
	
	ws.on('message', e => {
		ws.lastCommunicationTime = Date.now();
		var message = JSON.parse(e);
		switch(message.type){
			case 'pong':
				// Do nothing; time has already been noted.
				break;
			case 'ping all':
				pingAllForUser(req.session.userID, req.session.id);
				break;
			case 'link':
				var userConnections = activeConnections[req.session.userID];
				if(userConnections){
					for(var sessionID in userConnections){
						if(sessionID != req.session.id){
							userConnections[sessionID].send(JSON.stringify(message));
						}
					}
				}
				break;
			default: // unknown message
				break;
		}
	});

	if(!activeConnections[req.session.userID]) activeConnections[req.session.userID] = { };
	activeConnections[req.session.userID][req.session.id] = ws;
	
	ws.lastCommunicationTime = Date.now();
	broadcastActiveConnectionCount(req.session.userID);
});

//schedulePings(30000); // ping at 30 second intervals
schedulePings(10000); // (or perhaps 10)

app.listen(14464);
