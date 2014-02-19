#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var socketio = require('socket.io');
var util = require('util');
var WebSocket = require('ws');
var commander = require('commander');
var uuid = require('uuid').v4;
var async = require('async');
var SerialPort = require('serialport').SerialPort;
var sqlite3 = require('sqlite3').verbose();


// Command line options
commander
  .version(require('./package.json').version)
  .option('-p, --port <port>', 'the webserver port [8080]', Number, 8080)
  .option('-D, --device <dev|fake>', "the serial device or specify 'fake' for fake data [/dev/ttyACM0]", '/dev/ttyACM0')
    .option('-b, --baudrate <baudrate>', 'the serial device baud rate [9600]', Number, 9600)
  .option('-d, --database <file>', 'the sqlite3 database file [db/database.sqlite]', 'db/database.sqlite')
  .parse(process.argv);



var PCRLogger = {

    table_prefix: '', // e.g. 'pcr_'
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

    init: function(args) {
        this.args = args;

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
        
        this.db = new sqlite3.Database(this.args.database, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, function(err) {
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

    fake_serial_data_generator: function() {
        var packet = {
            type: 'T',
            device: 0,
            time: new Date().getTime(),
            value: ((Math.sin(this.fake_counter / 6) * (Math.random() + 1) / 2) + 1) * 50,
        };
        this.log_packet(packet);

        this.fake_counter += 1;
        if(this.fake_counter >= 100) {
            this.fake_counter = 0;
        }
    },
                              
    init_serial: function(callback) {
        
        if(this.args.device == 'fake') {
            console.log("Using fake data generator instead of serial device");
            // set up fake data generator
            // to be called every second
            this.fake_counter = 0;
            setInterval(this.fake_serial_data_generator.bind(this), 1000);
            callback();
            return;
        };

        console.log("Opening serial port: " + this.args.device);

        this.serial = new SerialPort(this.args.device, {
            baudrate: this.args.baudrate
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

        this.io.sockets.on('connection', function(socket) {
            socket.emit('welcome', {'msg': "Successfully connected"});
            this.sockets.push(socket);
            socket.on('get_datapoints', function(data) {
                if(!data || !data.series_id) {
                    // TODO report error to browser
                    console.log("Error: Received request for datapoints with no series_id specified");
                    return;
                }
                this.get_datapoints(data.series_id, function(err, datapoints) {
                    if(err) {
                        // TODO report error to browser
                        console.log("Error: " + err);
                        return;
                    }
                    // send datapoints to browser
                    socket.emit('datapoints', {
                        series_id: data.series_id,
                        datapoints: datapoints
                    });

                }.bind(this));
            }.bind(this));

            socket.on('begin_new_series', function() {
                this.create_series(function(series) {
                    socket.emit('new_series_begun', series);
                }.bind(this));
            }.bind(this));
        }.bind(this));

        console.log("Web server running on: http://localhost:"+this.args.port+"/")

        this.app.listen(this.args.port, function() {
            callback();
        });

        this.app.on('error', function(err) {
            // TODO report to clients
            console.log("Web server error: " + err);
        });
    },

    create_series: function(callback) {
        var series = {
            id: null,
            uuid: uuid(),
            start_time: new Date().getTime()
        };
        
        var self = this;
        // value order: id, uuid, time
        this.db.run("INSERT INTO '"+this.table_prefix+"series' VALUES (NULL, ?, ?)", 
                    [series.uuid, series.start_time],
                    function(err) {
                        if(err) {
                            // TODO report back to browser
                            console.log("sqlite3 error: " + err);
                            return;
                        }
                        console.log("============ " + this.lastID);
                        // 'this' references the finalized statement object
                        series.id = this.lastID;
                        self.series = series;
                        callback(series);
                    });
    },

    get_datapoints: function(series_id, callback) {
//        minutes = minutes || 1;
//        ms = minutes * 60 * 1000;
        series_id = series_id || this.series.id;
        if(!series_id) {
            callback("Cannot retrieve datapoints for unspecified series");
            return;
        }

//        var time = new Date().getTime() - ms;
        var time = 0;

        this.db.all("SELECT * FROM '" + this.table_prefix + "datapoints' WHERE time >= ? AND series_id = ?", [time, series_id], function(err, rows) {
            if(err) {
                callback(err);
                return;
            }
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
        var m = packet.match(/Temp:\s+(\d+\.?\d*)/);
        if(!m || (m.length < 2)) {
            console.log("Cannot parse packet: " + packet);
            return;
        }
        this.log_packet({
            type: 'temperature',
            device: 0,
            value: m[1],
            time: new Date().getTime()
        });
/*
        this.log_packet({
            type: parts[0],
            device: parseInt(parts[1]),
            time: new Date().getTime(),
            value: parseFloat(parts[2])
        });
*/
    },

    log_packet: function(packet) {

        if(!this.series) {
            console.log("Datapoint: " + util.inspect(packet) + " [not logging]");
            return;
        }
        
        console.log("Datapoint: " + util.inspect(packet) + " [Logging to series: " + this.series.id + "]");

        // value order: id, series_id, device, time, value
        this.db.run("INSERT INTO '"+this.table_prefix+"datapoints' VALUES (NULL, ?, ?, ?, ?)", 
                    [this.series.id, packet.device, packet.time, packet.value],
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
        console.log("Number of listening websockets: " + this.sockets.length);
        for(i=0; i < this.sockets.length; i++) {
            this.sockets[i].emit('datapoint', packet);
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
        // first check if datapoints table already exists
        var sql = "SELECT name FROM sqlite_master WHERE type='table' AND name='"+this.table_prefix+"datapoints';"
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

            var statements = [
                "CREATE TABLE '"+this.table_prefix+"series' (id INTEGER PRIMARY KEY, uuid TEXT, start_time INTEGER)",
                "CREATE TABLE '"+this.table_prefix+"datapoints' (id INTEGER PRIMARY KEY, series_id INTEGER, device INTEGER, time INTEGER, value REAL)"
            ];

            async.eachSeries(statements, function(statement, complete) {
                // run for each statement
                this.db.run(statement, {}, function(err) {
                    complete(err);
                }.bind(this));
            }.bind(this), function(err) {
                // called when all complete or error occurs
                if(err) {
                    callback(err);
                    return;
                }
                console.log("Database schema created.");
                callback();
            });
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


PCRLogger.init(commander);