var express = require('express');
var app = express();
var path = require('path');


var http = require('http').Server(app);
var io = require('socket.io')(http);
var cors = require('cors');
var bodyParser = require('body-parser');
var async = require('async');
//const uuidv1 = require('uuid/v1');
// connect to cassandra
let DB = require('./config_mssql.js');
var port = process.env.PORT || 5000;
// include fcm
//var FCM = require('fcm-push');


//enables cors
app.use(cors({
	'allowedHeaders': ['sessionId', 'Content-Type', 'authorization'],
	'exposedHeaders': ['sessionId'],
	'origin': '*',
	'methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
	'preflightContinue': true
}));

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies


// Add headers
/*app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');

    // Request methods you wish to allow
    //res.setHeader('Access-Control-Allow-Methods', 'POST');

	//res.setHeader('Access-Control-Expose-Headers', 'Authorization');
	
	res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
	
    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization ');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});*/

app.use('/public', express.static(__dirname + '/public'));


app.get('/custom', function (req, res) {
  res.sendfile(__dirname + '/custom.html');
});


// Get list of chat user
app.post('/get-users', function (req, res) {
	var user_id = req.body.user_id;
	//var user_id = 1;
	var responseUser = [];
	var finalResponseUser = [];
	
	let sqlUser = DB.select("SELECT * from messageroom WHERE SenderID='"+user_id+"' OR ReceiverID='"+user_id+"'");
	sqlUser.then(function(resultUser) {
        console.log(resultUser.recordset);

        var resultUser = resultUser.recordset;

		if(resultUser.length>0) {
			async.series([
				function(callback) {
					for(var i=0;i<resultUser.length;i++) {
						if(user_id==resultUser[i].SenderID) {
							responseUser[i] = {
								roomId: resultUser[i].Id,
								OpponentUser: resultUser[i].ReceiverID
							};
						}
						else {
							if(user_id==resultUser[i].ReceiverID) {
								responseUser[i] = {
									roomId: resultUser[i].Id,
									OpponentUser: resultUser[i].SenderID
								};
							}
						}
					}
					callback();
				},
				function(callback) {
					for(let i=0;i<responseUser.length;i++) {
						async.series([
							function(callback2) {
								let sqlUser = DB.select("SELECT u.FirstName, u.LastName,ui.ContentType,ui.Image40X40, ui.Image from [dbo].[User] u inner join [dbo].[UserImage] ui on ui.UserId = u.Id WHERE u.Id=" + responseUser[i].OpponentUser);
								console.log(sqlUser);
								sqlUser.then(function(resultUser) {
								console.log(resultUser);	
								var resultUser = resultUser.recordset;
									finalResponseUser[i] = {
										roomId: responseUser[i].roomId,
										OpponentUser: responseUser[i].OpponentUser,
										name: resultUser[0].FirstName + ' ' +resultUser[0].LastName,
										displayImage: 'data:' + resultUser[0].ContentType +';base64,'+ Buffer.from(resultUser[0].Image40X40).toString('base64')
									};
									
									callback2();
									
									if(i==parseInt(responseUser.length-1)) {
										//console.log(finalResponseUser);
					
										response = {status:'true',data:finalResponseUser};
										var jsonString = JSON.stringify(response);
										res.end(jsonString);
									}
								});
							}
						]);
					}
					
					
				}
			]);
			
		}
		else {
			response = {status:'false',data:resultUser};
			var jsonString = JSON.stringify(response);
			res.end(jsonString);
		}
	});
});


// Get chat history
app.post('/get-chat-history', function (req, res) {
	var room_id = req.body.room_id;
	var responseChat = [];
	let sqlChat = DB.select("SELECT * from message WHERE RoomId='"+room_id+"'");
	sqlChat.then(function(resultChat) {
        var resultChat = resultChat.recordset;
		if(resultChat.length>0) {
			for(var i=0;i<resultChat.length;i++) {
				responseChat[i] = {
                    id: resultChat[i].Id,
                    roomId: resultChat[i].RoomId,
                    senderId: resultChat[i].SenderID,
                    receiverId: resultChat[i].ReceiverID,
                    createdDate: resultChat[i].CreatedDate,
                    message: resultChat[i].Message,
                    isSeen: resultChat[i].IsSeen
                };
			}
			response = {status:'true',data:responseChat};
			var jsonString = JSON.stringify(response);
			res.end(jsonString);
		}
		else {
			response = {status:'false',data:resultChat};
			var jsonString = JSON.stringify(response);
			res.end(jsonString);
		}
	});
});



// usernames which are currently connected to the chat
var usernames = {};


io.sockets.on('connection', function (socket) {
	
	socket.on('room', function(data){
        console.log('Emitted on room');
        console.log(data);
        //var data = JSON.parse(data);
		socket.username = data.username;
		socket.room = data.room;
		//console.log(data.room+'-'+data.username);
		socket.join(data.room);
		//socket.emit('updatechat', 'from : SERVER you have connected to '+data.room);
		//socket.broadcast.to(data.room).emit('updatechat', 'SERVER', ' new user has connected to this room');
	});

	
	
	// every time listen reveal request
	// when the client emits 'sendchat', this listens and executes
	socket.on('sendchat', function (data) {

        var data = JSON.parse(data);
		var response = {};
        //var timeStamp = Math.floor(Date.now() / 1000);
        var timeStamp = '';
        
        /*
         * Insert into chat history
         */
        console.log(data);
        
        let insertQuery = "INSERT INTO message(RoomId,SenderId,ReceiverId,CreatedDate,Message,IsSeen) VALUES('"+data.room+"','"+data.sender_id+"','"+data.receiver_id+"','"+timeStamp+"','"+data.message+"','0')";
        let sqlInsert = DB.insert(insertQuery);
	    sqlInsert.then(function(resultMessage) {
            console.log('Message Inserted in Table '+resultMessage);
        });

		response = {status:'success',username:socket.username,message:data.message,cur_room:data.room};

		var jsonString = JSON.stringify(response);
		io.sockets.in(socket.room).emit('updatechat', jsonString);
	});

	// when the user disconnects.. perform this
	socket.on('disconnect', function(){
		// remove the username from global usernames list
		delete usernames[socket.username];
		// update list of users in chat, client-side
		io.sockets.emit('updateusers', usernames);
		// echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
		socket.leave(socket.room);
    });
    
    socket.on('typing', (data)=>{
        if(data.typing==true)
            io.emit('display', data)
        else
            io.emit('display', data)
    });

    //code explained later
    socket.on('display', (data)=>{
        if(data.typing==true)
          $('.typing').text(`${data.user} is typing...`)
        else
          $('.typing').text("")
      })
});

http.listen(port, function(){
  console.log('listening on *:' + port);
});
