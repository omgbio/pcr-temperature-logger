

var pcr_logger;

$(document).ready(function() {

    TimeSeries.create('#pcr_plot');

    pcr_logger = PCRLogger.create({
        container: '#container',
        on_packet_received: function(err, packet) {
            TimeSeries.update([packet.time, packet.value]);
        },
        on_packets_received: function(err, packets) {
            var datapoints = [];
            var i;
            for(i=0; i < packets.length; i++) {
                datapoints.push([packets[i].time, packets[i].value]);
            }
            TimeSeries.replace(datapoints);
        }
    });

});