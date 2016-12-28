const express = require('express');
const expressSession = require('express-session');
const knexSessionStore = require('connect-session-knex')(expressSession);
const bodyParser = require('body-parser');
const csurf = require('csurf');
const ent = require('ent'); //todo: this isn't needed because of jade, right?
const path = require('path');

const app = express();
const expressWs = require('express-ws')(app);

const routes = require('./routes.js');

const connections = require('./connections.js');
const activeConnections = connections.activeConnections;

const db = require('./db.js');

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'pug');

app.use(expressSession({
	secret: 'changeThisLater',
	resave: false,
	saveUninitialized: false,
	cookie: { maxAge: 50000000000 }, // 50 billion ms is just over a year and a half.
	store: new knexSessionStore({
		knex: db
	})
}));

app.use(bodyParser.urlencoded({ extended: true }));

app.use('/static', express.static(path.join(__dirname, '/static')));

app.use(routes);

app.ws('/', function(ws, req){
	ws.on('close', e => {
		connections.closeActiveConnection(req.session);
		connections.broadcastActiveConnectionCount(req.session.userID);
	});
	
	ws.on('message', e => {
		ws.lastCommunicationTime = Date.now();
		var message = JSON.parse(e);
		switch(message.type){
			case 'pong':
				// Do nothing; time has already been noted.
				break;
			case 'ping all':
				connections.pingAllForUser(req.session.userID, req.session.id);
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
	connections.broadcastActiveConnectionCount(req.session.userID);
});

connections.schedulePings(10000); // ping at 10 second intervals

app.listen(14464);
