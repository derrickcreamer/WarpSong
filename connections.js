var activeConnections = module.exports.activeConnections = { };

var ping = module.exports.ping = function ping(ws){
	ws.send(JSON.stringify({ type: 'ping' }));
}

var pingAll = module.exports.pingAll = function pingAll(){
	var any = false;
	for(var userID in activeConnections){
		any = true;
		for(var sessionID in activeConnections[userID]){
			ping(activeConnections[userID][sessionID]);
		}
	}
	if(any)	setTimeout(pingCheck, 5000);
}

var schedulePings = module.exports.schedulePings = function schedulePings(interval){
	setTimeout(() => {
		pingAll();
		schedulePings(interval);
	}, interval);
}

var closeActiveConnection = module.exports.closeActiveConnection = function closeActiveConnection(session){
	if(activeConnections[session.userID]){
		var ws = activeConnections[session.userID][session.id];
		if(ws){ // Close, then remove any existing connection for this session.
			ws.close();
			delete activeConnections[session.userID][session.id];
		}
	}
}

var activeConnectionCount = module.exports.activeConnectionCount = function activeConnectionCount(userID){
	var userConnections = activeConnections[userID];
	if(userConnections) return Object.keys(userConnections).length;
	else return 0;
}

var broadcastActiveConnectionCount = module.exports.broadcastActiveConnectionCount = function broadcastActiveConnectionCount(userID){
	var count = activeConnectionCount(userID);
	var userConnections = activeConnections[userID];
	if(userConnections){
		for(var sessionID in userConnections){
			userConnections[sessionID].send(JSON.stringify({ type: 'connectionCount', count: count }));
		}
	}
}

var pingCheckForUser = module.exports.pingCheckForUser = function pingCheckForUser(userID){
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

var pingCheck = module.exports.pingCheck = function pingCheck(){
	for(var userID in activeConnections){
		pingCheckForUser(userID);
	}
}

var pingAllForUser = module.exports.pingAllForUser = function pingAllForUser(userID, currentSessionID){
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

var getActiveConnection = module.exports.getActiveConnection = function getActiveConnection(session){
	if(activeConnections[session.userID]){ // Check whether this user has any active connections...
		return activeConnections[session.userID][session.id]; // ...for this session.
	}
	else return null;
}
