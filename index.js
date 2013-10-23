#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var socketio = require('socket.io');
var util = require('util');
var SerialPort = require('serialport').SerialPort;
var sqlite3 = require('sqlite3').verbose();
var WebSocket = require('ws');

var PCRLogger = {

    tablename: 'temps',
    buffer: '',
    sockets: [],

    mime_types: {
        "html": "text/html",
        "js": "text/javascript",
        "css": "text/css",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg"
    },

    init: function(opt) {
        
        this.init_db(function(err) {
            if(err) {
                console.log("Initialization failed. Shutting down.");
                return;
            }

            this.init_serial(function(err) {
                if(err) {
                    console.log("Initialization failed. Shutting down.");
                    return;
                }
                
                this.init_web(function(err) {
                    if(err) {
                        console.log("Initialization failed. Shutting down.");
                        return;
                    }
                    
                    console.log("PCR logger initialized");

                }.bind(this));
            }.bind(this));
        }.bind(this));

    },
    
    init_db: function(callback) {
        
        this.db = new sqlite3.Database('db/database.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, function(err) {
            if(err) {
                // TODO what does error object look like?
                console.log("could not open database: " + err);
                callback(err);
                return;
            }
            this.create_schema(function(err) {
                if(err) {
                    console.log("Error creating db schema: " + err);
                    callback(err);
                    return;
                }
                callback();
    
            }.bind(this));
        }.bind(this));
    },
                              
    init_serial: function(callback) {
        
        this.serial = new SerialPort('/dev/ttyACM0', {
            baudrate: 9600
        }, false);
        
        this.serial.on('error', function() {});
        
        this.serial.open(function(err) {
            if(err) {
                console.log(err.toString());
                callback(err);
                return;
            }
            console.log("Serial port open.");
            this.serial.on('error', this.on_error.bind(this));
            this.serial.on('data', this.on_data_received.bind(this));

            callback();
        }.bind(this))

    },


    init_web: function(callback) {

        this.app = http.createServer(this.http_request_handler.bind(this));
        this.io = socketio.listen(this.app);
        this.app.listen(8080);
        // TODO are there callbacks for createServer or listen we can use?
        callback();

        this.io.sockets.on('connection', function(socket) {
            socket.emit('welcome', {'msg': "Successfully connected"});
            socket.on('get_datapoints', function() {

                this.get_datapoints(10, function(err, datapoints) {
                    if(err) {
                        console.log("Error: failed to get datapoints");
                        return;
                    }
                    socket.emit(datapoints);

                }.bind(this));
            }.bind(this));
        }.bind(this));
    },

    get_datapoints: function(minutes, callback) {
        minutes = minutes || 10;
        ms = minutes * 60 * 1000;

        var time = new Date().getTime() - ms;

        this.db.all("SELECT * FROM " + this.tablename + " WHERE time >= ?", [time], function(err, rows) {
            if(err) {
                callback(err);
                return;
            }
//            console.log(util.inspect(rows));
            callback(null, rows);

        }.bind(this));
    },


    on_data_received: function(data) {
        this.buffer += data;
        if(this.buffer.match("\n")) {
            this.got_packet(this.buffer);
            this.buffer = '';
        }
    },

    got_packet: function(packet) {
        var parts;
        parts = packet.split(':');
        this.log_packet({
            type: parts[0],
            device: parseInt(parts[1]),
            value: parseFloat(parts[2])
        });
    },

    log_packet: function(packet) {

        console.log("Logging: " + util.inspect(packet));

        var time = new Date().getTime();

        // value order: id, device, time, temperature
        this.db.run("INSERT INTO "+this.tablename+" VALUES (NULL, ?, ?, ?)", 
                    [packet.device, time, packet.value],
                    function(err, result) {
                        if(err) {
                            console.log("sqlite3 error: " + err);
                            return;
                        }
                        this.broadcast_packet(packet);
                    }.bind(this));
    },

    broadcast_packet: function(packet) {
        var i;
        for(i=0; i < this.sockets.length; i++) {
            sockets[i].emit('datapoint', packet);
        }
    },

    print_errors: function(err_data) {
        console.log("Error(s) encountered:")
        var err;
        for(err in err_data) {
            console.log(err.toString()+': '+err_data[err].toString());
        }
    },

    on_error: function(err_data) {
        this.print_errors(err_data);
    },

    create_schema: function(callback) {
        var tablename = 'temps';
        // first check if it the table already exists
        var sql = "SELECT name FROM sqlite_master WHERE type='table' AND name='"+this.tablename+"';"
        this.db.get(sql, {}, function(err, row) {
            if(err) {
                callback(err);
                return;
            }
            if(row) {
                console.log("Database schema found.");
                callback();
                return;
            }

            sql = "CREATE TABLE "+this.tablename+"(id INTEGER PRIMARY KEY, device INTEGER, time INTEGER, temperature REAL);";
            this.db.run(sql, {}, function(err) {
                if(err) {
                    callback(err);
                    return;
                }
                console.log("Database schema created.");
                callback();
            }.bind(this));
        }.bind(this));
    },

    http_request_handler: function (req, res) {
        var uri_path = url.parse(req.url).pathname;
        if(!uri_path || (uri_path == '') || (uri_path == '/')) {
            uri_path = 'index.html';
        }
        var filename = path.join(process.cwd(), 'www', uri_path);
        fs.exists(filename, function(exists) {
            if(!exists) {
                console.log("404: " + filename);
                res.writeHead(200, {
                    'Content-Type': 'text/html'
                });
                res.write("<!DOCTYPE html><html><body>404 Not Found</body></html>");
                res.end();
                return;
            }
            
            var mime_type;
            var parts = path.extname(filename).split(".");
            if(parts.length > 1) {
                mime_type = this.mime_types[parts[parts.length-1]];
            }
            if(!mime_type) {
                mime_type = 'text/plain';
            }
            res.writeHead(200, mime_type);
            
            var file_stream = fs.createReadStream(filename);
            file_stream.pipe(res);
        }.bind(this));
    }
};


PCRLogger.init();