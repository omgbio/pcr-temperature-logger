

var pcr_logger;

$(document).ready(function() {

    TimeSeries.create('#pcr_plot');

    pcr_logger = PCRLogger.create({
        container: '#container',
        on_packet_received: function(err, packet) {
            var datapoint = [packet.time, packet.value];
            console.log("Plotting: " + datapoint);
            var c = parseFloat(packet.value);
            var f = c * (9/5) + 32;
            $('#temperature').html(c.toFixed(2) + " Celsius | " + f.toFixed(2) + " Fahrenheit");
            TimeSeries.update(datapoint);
        },
        on_packets_received: function(err, data) {
            
            var begin_time = data.datapoints[0].time;

            var pairs = [];
            var i;
            var time;
            for(i=0; i < data.datapoints.length; i++) {
                time = Math.round((data.datapoints[i].time - begin_time) / 1000);
                pairs.push([time, data.datapoints[i].value]);
            }
            TimeSeries.replace(pairs);

            $('#series_id').val(data.series_id);
            $('#status').html("Showing previously recorded series");
        }
    });

    $('#fetch_series_btn').click(function() {
        var series_id = parseInt($('#series_id').val());
        if(!series_id) {
            // TODO don't use alert
            alert("You must enter a series id");
            return;
        }
        
        pcr_logger.get_datapoints(series_id);
    });

    $('#begin_series_btn').click(function() {
        pcr_logger.begin_new_series(function(series) {
            $('#status').html("Recording new series");
            $('#series_id').val(series.id);
            console.log("Began series: " + series);
        });
    });

    $('#status').html("Waiting for user input");
});