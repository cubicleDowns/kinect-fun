var express = require('express'),
	app = express(),
	server = require('http').createServer(app);


server.listen(8000);
console.log('Server listening on port 8000');
console.log('Point your browser to http://localhost:8000');

app.use(express.static('public'));
