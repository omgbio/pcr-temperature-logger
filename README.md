
This is a small node.js web app and arduino program for reading reading temperature using one or more Dallas Semiconductor DS18x2x family probes, logging the temperature and time to a sqlite database and plotting the measurements in real time in a web browser.

Currently the arduino code supports multiple temperature probes but the web app only supports a single probe.

This is the beginnings of the desktop biolab control interface.

# Features #

* Real-time plotting using websockets and [flot](https://code.google.com/p/flot/).
* Record measurements to sqlite database.
* Organize groups of measurements into data series.
* Retrieve and plot previously recorded data series.

# ToDo #

* Switch app to levelup (possibly (timestreamdb)[https://github.com/brycebaril/timestreamdb]), (shoe)[https://github.com/substack/dnode] and (dnode)[https://github.com/substack/dnode].
* Add name and description to data series
* List existing series
* Select time and temperature range for plot
* Plot multiple series on same plot
* Export series to json and csv
* Show current temperature without recording

# Installation #

On Debian/Ubuntu based systems prerequisites can be installed with:

```
sudo aptitude install nodejs npm build-essential libsqlite3-dev
```

Required node libraries can be installed with:

```  
cd pcr-temperature-logger
npm install
```

Grant serial port access to the user running the server side js:

```
sudo chown <user> <serial_port_device>
```

E.g:

```
sudo chown joe /dev/ttyACM0
```

# Running #

Start the program with e.g:

```
./index.js -D /dev/ttyACM0
```

Then point your web-browser at:

```
http://localhost:8080
```

If you don't have a PCR device hooked up, then you can tell the program to generate fake data using:

```
./index.js -D fake
```

# License #

License for Arduino code: GPLv3
License for Web app: AGPLv3
