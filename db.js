var knex = require('knex');
var path = require('path');

var db = knex({
	client: 'sqlite3',
	connection: {
		filename: path.join(__dirname, 'warpsong.sqlite3')
	},
	useNullAsDefault: true
});

module.exports = db;