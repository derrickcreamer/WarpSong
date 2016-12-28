var Promise = require('bluebird');
var scrypt = require('scrypt-for-humans');
var router = require('express').Router();

var connections = require('./connections.js');

var db = require('./db.js');

router.get('/login', (req, res) => res.render('login'));

router.get('/register', (req, res) => res.render('register'));

router.post('/login', (req, res) => {
	return Promise.try(() => db('users').where({ name: req.body.name }))
	.then(users => {
		if(users.length == 0) res.render('login', { errors: ['Invalid username or password.'] });
		else{
			return Promise.try(() => scrypt.verifyHash(req.body.pw, users[0].hash))
			.then(() => {
				req.session.userID = users[0].id; // Login successful
				res.redirect('/');
			})
			.catch(scrypt.PasswordError, err => res.render('login', { errors: ['Invalid username or password.'] }));
		}
	});
});

router.post('/register', (req, res) => {
	var locals = { errors: [] };
	if(req.body.pw !== req.body.confirmPw) locals.errors.push('Passwords do not match.'); // Don't bother checking pw length if they don't match.
	else if(req.body.pw.length < 4) locals.errors.push('Password must contain at least 4 characters.');
	if(req.body.name.length < 2){ // Don't bother checking for existing user if name is too short.
		locals.errors.push('Username must contain at least 2 characters.');
		res.render('register', locals);
	}
	else{ //todo, more errors, for valid chars etc.
		return Promise.all(
			[
				() => scrypt.hash(req.body.pw),
				() => db('users').where({ name: req.body.name })
			].map(x => Promise.try(x)))
		.then(results => {
			var hash = results[0];
			var users = results[1];
			if(users.length > 0){
				locals.errors.push('That username is already taken.');
				res.render('register', locals);
			}
			else{ // registration successful
				return Promise.try(() => db('users').insert({ name: req.body.name, hash: hash }))
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

router.use('/', (req, res, next) => { // Verify login
	if(!req.session.userID) res.redirect('/login');
	else{
		return Promise.try(() => db('users').where({ id: req.session.userID }))
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

router.get('/reconnect', (req, res) => {
	if(!connections.getActiveConnection(req.session)) res.redirect('/'); // If there's no active connection, go back to the homepage.
	else res.render('reconnect');
});

router.post('/reconnect', (req, res) => {
	connections.closeActiveConnection(req.session);
	res.redirect('/');
});

router.get('/', (req, res) => {
	if(connections.getActiveConnection(req.session)) res.redirect('/reconnect'); // Offer to let them reconnect, if there's an active connection already.
	else res.render('index');
});

module.exports = router;