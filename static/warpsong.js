function handleSubmit(e){
	e.preventDefault();
	sendMessage();
}

function sendMessage(){
	var linkInput = document.getElementById('linkInput');
	var dumbUrlRegex = /^[-A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%]+[.][-A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%]+$/; // almost any char, dot, almost any char.
	if(dumbUrlRegex.test(linkInput.value)){
		selectText(addLinkToPage(linkInput.value));
		ws.send(JSON.stringify({ type: 'link', link: linkInput.value }));
		linkInput.value = '';
	}
}

var pasteAlreadyChecked = false;

function checkForPaste(){
	if(document.getElementById('autoSendOption').checked){
		var linkInput = document.getElementById('linkInput');
		if(pasteAlreadyChecked){
			if(linkInput.value.length == 0) pasteAlreadyChecked = false;
		}
		else{
			pasteAlreadyChecked = true;
			sendMessage(); // Send if it's a link. Always fails for single chars.
		}
	}
}

function updateNumConnections(count){
	document.getElementById('connectionCount').innerText = count;
	//todo, border colors etc.?
}

function addLinkToPage(url){
	var a = document.createElement('a');
	a.innerHTML = url;
	a.setAttribute('href', url);
	a.setAttribute('target', '_blank');
	var chatlog = document.getElementById('chatlog');
	chatlog.insertBefore(a, chatlog.firstChild);
	return a;
}

function selectText(element){
	element = element || document.getElementById(element);
	element.focus();
	if(document.body.createTextRange){
		var range = document.body.createTextRange();
		range.moveToElementText(element);
		range.select();
	}
	else if(window.getSelection){
		var selection = window.getSelection();
		var range = document.createRange();
		range.selectNodeContents(element);
		selection.removeAllRanges();
		selection.addRange(range);
	}
}

var ws = new WebSocket('ws://localhost:14464/');

ws.onopen = function(e){
	//todo, "connected!" ?
};

ws.onclose = function(e){
	updateNumConnections('?');
	//todo, what else? gray stuff out, disable button?
};

ws.onmessage = function(e){
	var message = JSON.parse(e.data);
	switch(message.type){
		case 'ping':
			ws.send(JSON.stringify({ type: 'pong' }));
			break;
		case 'connectionCount':
			updateNumConnections(message.count);
			break;
		case 'link':
			var a = addLinkToPage(message.link);
			if(document.getElementById('autoOpenOption').checked){
				window.open(message.link, '_blank');
				//todo, maybe move this link to 'old links' area?
			}
			else{
				selectText(a);
			}
			break;
		default: // unknown message
			break;
	}
};
