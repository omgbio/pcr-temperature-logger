
var PCRLogger = {

    create: function(p) {
        return new this.instance(p)
    },

    instance: function(p) {
        p = p || {};
       
        this.init = function(p) {
            this.websocket_url = this.build_websocket_url();

            this.socket = io.connect(this.websocket_url);

            this.socket.on('welcome', function(data) {
                console.log('Server says: ' + data.msg);
                this.socket.emit('get_datapoints', {past: 2});
            }.bind(this));
            
            this.socket.on('datapoints', function(data) {

                console.log("Got datapoints: ");
                console.log(data);

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