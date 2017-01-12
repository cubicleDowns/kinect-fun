var Kinect2 = require('kinect2'),
	express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server);

var kinect = new Kinect2();

if(kinect.open()) {
	server.listen(5555);
	console.log('Kinect WebSockets broadcasting on port 5555');

	kinect.on('bodyFrame', function(bodyFrame){
		io.sockets.emit('bodyFrame', bodyFrame);
	});

	kinect.openBodyReader();
}
