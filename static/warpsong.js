var numConnections = 0;
var pasteAlreadyChecked = false;
var originalTitle = document.title;
var flashingTitle = false;
var ws = new WebSocket('ws://localhost:14464/');

ws.onclose = function(e){
	updateNumConnections(0);
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
			var url = getURL(message.link);
			var a = addLinkToPage(url);
			if(document.getElementById('autoOpenOption').checked){
				window.open(url, '_blank');
				//todo, maybe move this link to 'old links' area?
			}
			else{
				selectText(a);
				if(!document.hasFocus()) flashTitle(1000, true);
			}
			break;
		default: // unknown message
			break;
	}
};

window.onfocus = function(e){
	flashingTitle = false;
	document.title = originalTitle;
}

function updateNumConnections(count){
	numConnections = count;
	var countDisplay = document.getElementById('connectionCount');
	if(count == 0) countDisplay.innerText = '?';
	else countDisplay.innerText = count;
	document.getElementById('linkButton').disabled = count < 2;
}

function sendMessage(){
	var linkInput = document.getElementById('linkInput');
	var dumbUrlRegex = /^[-A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%]+[.][-A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%]+$/; // almost any char, dot, almost any char.
	if(dumbUrlRegex.test(linkInput.value)){
		selectText(addLinkToPage(linkInput.value));
		ws.send(JSON.stringify({ type: 'link', link: linkInput.value }));
		linkInput.value = '';
		pasteAlreadyChecked = false;
	}
}

function handleSubmit(e){
	e.preventDefault();
	sendMessage();
}

function checkForPaste(){
	if(document.getElementById('autoSendOption').checked){
		var linkInput = document.getElementById('linkInput');
		if(pasteAlreadyChecked){
			if(linkInput.value.length == 0) pasteAlreadyChecked = false;
		}
		else{
			pasteAlreadyChecked = true;
			if(numConnections > 1) sendMessage(); // Send if it's a link. Always fails for single chars.
		}
	}
}

function addLinkToPage(url){
	var text = url;
	url = getURL(url);
	var a = document.createElement('a');
	a.innerHTML = text;
	a.setAttribute('href', url);
	a.setAttribute('target', '_blank');
	var div = document.createElement('div');
	div.appendChild(a);
	var chatlog = document.getElementById('chatlog');
	chatlog.insertBefore(div, chatlog.firstChild);
	return a;
}

function getURL(url){
	var lower = url.toLowerCase();
	if(lower.substring(0, 8) === 'https://') return url;
	if(lower.substring(0, 7) === 'http://') return url;
	if(lower.substring(0, 6) === 'ftp://') return url;
	else return 'http://' + url;
}

function selectText(element){
	element = element || document.getElementById(element);
	if(document.body.createTextRange){
		element.focus();
		var range = document.body.createTextRange();
		range.moveToElementText(element);
		range.select();
	}
	else if(window.getSelection){
		element.focus();
		var selection = window.getSelection();
		var range = document.createRange();
		range.selectNodeContents(element);
		selection.removeAllRanges();
		selection.addRange(range);
	}
}

function flashTitle(interval, start){
	if(start) flashingTitle = true;
	if(flashingTitle){
		if(document.title === originalTitle) document.title = '* HEY! LISTEN! *';
		else document.title = originalTitle;
		setTimeout(() => {
			flashTitle(interval);
		}, interval);
	}
}
