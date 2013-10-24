
var PCRLogger = {

    create: function(p) {
        return new this.instance(p)
    },

    instance: function(p) {
        this.p = p || {
            container: null,
            on_packet_received: null,
            on_packets_received: null
        };
       
        this.init = function(p) {
            this.websocket_url = this.build_websocket_url();

            this.socket = io.connect(this.websocket_url);

            this.socket.on('welcome', function(data) {
                this.socket.emit('get_datapoints', {past: 2});
            }.bind(this));
            
            this.socket.on('datapoints', function(data) {
                if(this.p.on_packets_received) {
                    this.p.on_packets_received(null, data);
                }                
            }.bind(this));

            this.socket.on('datapoint', function(data) {

                console.log("Got datapoint");

                if(this.p.on_packet_received) {

                    this.p.on_packet_received(null, data);
                }
            }.bind(this));
        };

        this.build_websocket_url = function() {
            var port = '';
            if(((window.location.port != 80) && (window.location.protocol == 'http:')) || ((window.location.port != 443) && (window.location.protocol == 'https:'))) {
                port = ':'+window.location.port;
            }
            return window.location.protocol+'//'+window.location.hostname+port;
        };

        this.init();
    }

};