#include <OneWire.h>

/*
  omgbio PCR multi temperature probe reader 
  for Dallas Semiconductor DS18x2x family probes.
  
  License: GPLv3
*/

#define DEBUG (1)

struct device {
  int index;
  byte addr[8];
  int model_s;
  int is_ds18x2x;
};

OneWire ds(6);  // on pin 10 (a 4.7K resistor is necessary)

struct device devices[8];
int device_count = 0;

void debug_byte(byte b) {
  if(DEBUG) {
    Serial.print(b, HEX);
  }
}

void debug_float(float f) {
  if(DEBUG) {
    Serial.print(f);
  }
}

void debug_int(int i) {
  if(DEBUG) {
    Serial.print(i);
  }
}

void debug(char* str) {
  if(DEBUG) {
    Serial.print(str); 
  }
}

void find_devices() {
  byte addr[8];
  int i, j;

  ds.reset_search();
  delay(250);
  i = 0;
  while(ds.search(addr)) {  
    
    devices[i].index = i;
    debug("Found device: ");
    
    if(OneWire::crc8(addr, 7) != addr[7]) {
      debug("Invalid checksum! Skipping.\n");
      continue; 
    }
    
    for(j=0; j < 8; j++) {
      devices[i].addr[j] = addr[j];
      debug("0x");
      debug_byte(addr[j]);
      if(j < 7) {
        debug(":"); 
      }
    }
    debug(" Type: ");

    devices[i].is_ds18x2x = 1;
    
    // the first ROM byte indicates which chip
    switch (addr[0]) {
      case 0x10:
        debug("DS18S20 or DS1820");
        devices[i].model_s = 1;
        break;
      case 0x28:
        debug("DS18B20");
        devices[i].model_s = 0;
        break;
      case 0x22:
        debug("DS1822");
        devices[i].model_s = 0;
        break;
      default:
        debug("Not a DS18x2x family device.");
        devices[i].is_ds18x2x = 0;
        return;
    } 
    
    debug("\n");
    i++;
  }
  

  
  device_count = i;
}

void setup(void) {
  // power on the temperature sensor
  // pin 8 is power pin for temperature sensor
  pinMode(8, OUTPUT);
  digitalWrite(8, HIGH);
  
  Serial.begin(9600);

  delay(2000); // Wait a bit so we can show the serial console
  
  find_devices();
  
}

/*
  This function based on the temperature reading example
  from the OneWire Arduino library example
*/
void read_temperature(struct device* dev) {
  int i;
  byte present = 0;
  byte data[12];
  float celsius;
  
  ds.reset();
  ds.select(dev->addr);
  ds.write(0x44, 1); // start conversion, with parasite power on at the end
  
  delay(1000); // maybe 750ms is enough, maybe not
  
  // we might do a ds.depower() here, but the reset will take care of it.
  present = ds.reset();
  
  ds.select(dev->addr);
  ds.write(0xBE);         // Read Scratchpad

  // read 9 bytes;
  for ( i = 0; i < 9; i++) {
    data[i] = ds.read();
  }

  // Convert the data to actual temperature
  // because the result is a 16 bit signed integer, it should
  // be stored to an "int16_t" type, which is always 16 bits
  // even when compiled on a 32 bit processor.
  int16_t raw = (data[1] << 8) | data[0];
  if (dev->model_s) {
    raw = raw << 3; // 9 bit resolution default
    if (data[7] == 0x10) {
      // "count remain" gives full 12 bit resolution
      raw = (raw & 0xFFF0) + 12 - data[6];
    }
  } else {
    byte cfg = (data[4] & 0x60);
    // at lower res, the low bits are undefined, so let's zero them
    if (cfg == 0x00) raw = raw & ~7;  // 9 bit resolution, 93.75 ms
    else if (cfg == 0x20) raw = raw & ~3; // 10 bit res, 187.5 ms
    else if (cfg == 0x40) raw = raw & ~1; // 11 bit res, 375 ms
    //// default is 12 bit resolution, 750 ms conversion time
  }
  celsius = (float)raw / 16.0;
//  fahrenheit = celsius * 1.8 + 32.0;
  Serial.print("D:");
  Serial.print(dev->index);
  Serial.print(":");
  Serial.print(celsius);
  Serial.print("\n");  
}


void loop(void) {
  
  int i;
  for(i=0; i < device_count; i++) {
    read_temperature(&(devices[i]));
  }
  
 delay(1000);
}
