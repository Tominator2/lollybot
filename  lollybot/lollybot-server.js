/**
 *
 *   lollybot-server.js
 *
 *   Copyright 2013 Thomas Tilley.
 *   http://www.tomtilley.net/projects/suckerbot/
 *
 *   This file is part of the Lollybot Telemetry & Control Software.
 *
 *   Lollybot's telemetry & control is free software: you can
 *   redistribute it and/or modify it under the terms of the GNU
 *   General Public License as published by the Free Software
 *   Foundation, either version 3 of the License, or (at your option)
 *   any later version.
 *
 *   Lollybot's telemetry & control software is distributed in the
 *   hope that it will be useful, but WITHOUT ANY WARRANTY; without
 *   even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 *   PARTICULAR PURPOSE.  See the GNU General Public License for more
 *   details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with Lollybot's telemetry & control software.  If not, see
 *   <http://www.gnu.org/licenses/>.
 *
 */

//
// This is the node.js server code for Lollybot's telemetry and
// control software
//
// It communicates with the robot via USB and sends the data via
// sockets to a browser based HTML5/JavaScript client

// ToDo:
// -------------------
// - Die gracefully with a message if USB is unplugged
// - Package as a plug-in for npm?
//   - it requires the Socket.IO, node-hid, and commander plug-ins 
// - Should check for exit in repl and disconnect/check-in any USB
//   devices in use as well as turning off motors.
//   see: http://nodejs.org/api/repl.html#repl_event_exit
//

var program = require('commander');  // plug-in for command line options

// Uncomment the appropriate line below depending upon your platform:
var HID = require('./windows/HID');  // plug-in for USB communication on WinXP/7
// var HID = require('node-hid');  // plug-in for USB communication on Linux/Mac
 
var REPL = require('repl');          // Needed by node-hid
var repl = REPL.start({ignoreUndefined: true}); // REPL.start('node-hid> ');

var versionNo = "0.1.0";

var portNo = "8075"; // Default port for conections - "BOTS" in 1337!

var oldData = [0,0,0,0,0,0,0,0]; // store last USB data values received

// Array to store the button states where:
// - 0..11 are buttons 1..12
// - 12..15 are the D-Pad buttons (Up,Right,Down,Left)
// - 16 is the analog button (not all joysticks report this button's state)
var ButtonPressed = [false, false, false, false,
		     false, false, false, false,
		     false, false, false, false,
		     false, false, false, false,
		     false];

// Analog joystick values [left-x, left-y, right-x, right-y] (0..255)
var AnalogJoyValues = [127, 127, 127, 127];

// Create bit masks for each button value - byte 5 is shifted
// left by 8 bits and or'ed with byte 6 from the joystick data
var ButtonMask = [0x1000,
		  0x2000,
		  0x4000,
		  0x8000,
		  0x0001,
		  0x0002,
		  0x0004,
		  0x0008,
		  0x0010,
		  0x0020,
		  0x0040,
		  0x0080];

// Create bit masks for each of the D-Pad button values in byte 5
var DpadMask = [0x00,   // D-Pad: North
		0x02,   // D-Pad: East
		0x04,   // D-Pad: South
		0x06];  // D-Pad: West

// Constants used for determining joystick and button values
var NORTH_EAST = 0x01; // NE
var SOUTH_EAST = 0x03; // SE
var SOUTH_WEST = 0x05; // SW
var NORTH_WEST = 0x07; // NW
var ANALOG_STICKS  = 0x40; // analog mode is on  (only for some joysticks!)
var DIGITAL_STICKS = 0xC0; // analog mode is off (only for some joysticks!)
var STICK_MIN = 0x00;  // LEFT or UP
var STICK_MID = 0x7F;  // CENTERED
var STICK_MAX = 0xFF;  // RIGHT or DOWN

// Create the motor instruction arrays:
// $00 51 00 RR 00 LL 00 00 - motor power levels
// byte 5 (LL) contains the left motor power 0..255 (0x00..0xff)
// byte 3 (RR) contains the right motor power 0..255 (0x00..0xff)
var PowerInstr = [0x00, 0x51, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

// $00 fa fe 00 00 00 00 00 - Transmit the power levels
// you must send a power instruction first then this data
var TxInstr    = [0x00, 0xfa, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00];

// $00 f3 00 00 00 00 00 00 - Stop
var OffInstr   = [0x00, 0xf3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

// the left motor power level (0..255)
var motorL = 0;  

// the right motor power level (0..255)
var motorR = 0;  

var robotMode = "Undefined"; // current robot mode

var loggingEnabled = false; // flag for logging

// Used for finding local IP address(es)
var os = require('os');
var ifaces = os.networkInterfaces();

// Create server and socket to listen for client connections
var app = require('http').createServer(); 
var io  = require('socket.io').listen(app); // plug-in for socket communication
var fs  = require('fs');

var socketConnection;

var logDir = "logs/";  // log file directory
var logFileName = "";
var modeStartTime = null;


// Utility function for splitting joystick vendor and product ID's
// provided via the command line option
function list(val) {
    return val.split(',',2).map(Number);
}


// Command line option information for Commander.js
program
    .version(versionNo)
    .option('-p, --port <port>', 'port for client connections (default is ' + portNo + ')', Number, portNo)  // e.g. '-p 8075'
    .option('-j, --joystick <v_id>,<p_id>', 'use USB joystick with this vendor & product ID', list, [0,0])     // e.g. '-j 0x0076,0x0006'
    .option('-d, --debug', 'display verbose USB joystick data')
    .parse(process.argv);

console.log("\n+------------------------------------------------------+");
console.log("| LOLLYBOT Telemetry & Control Server (version " + versionNo + ") |");
console.log("+------------------------------------------------------+\n");

// can we catch commander errors and display usage info instead?

var V_ID = program.joystick[0]; // USB Vendor ID
var P_ID = program.joystick[1]; // USB Product ID

// Check out the USB joystick that is the robot
//
// This function will exit the program if no joysticks are found, use
// a joystick if only one is connected, and give you details before
// exiting if more than one joystick is found.  It also checks for
// valid USB device details on the command line
if (V_ID == 0 || P_ID == 0 || isNaN(V_ID) || isNaN(P_ID)) {

    // no USB device specified!
    var devices = HID.devices(); // get list of USB devices
    var deviceNames = [];
    var joysticks = [];
    
    for (var i = 0; i < devices.length; i++) { 
	
	var usbDev = devices[i];
	
	// Check to see if we have appropriate permissions!
	if (!usbDev.product) {
		console.error('Cannot access USB device properties!\nIf you are running on a Unix-like system check that you have appropriate permissions (or try \'sudo node lollybot-server.js\'');
		process.exit(1);	
	}

	// Edit the list of USB devices to joysticks only
	if (usbDev.product.toLowerCase().indexOf("joy") != -1 &&
	    usbDev.path.indexOf("vid_dead") == -1) {
	    deviceNames.push(usbDev.product.trim() + ' (V_ID=' + usbDev.vendorId + 
			',P_ID=' + usbDev.productId + ')');
	    joysticks.push(usbDev);
	}
    }

    if (deviceNames.length == 0) {        // no joysticks found
	console.error();
	console.error('No USB joystick detected!  Please connect the robot\'s USB cable to this machine & restart the program.');
	console.error();
	process.exit(1);
    } else if (deviceNames.length == 1) { // only 1 joystick so use it
	V_ID = joysticks[0].vendorId;
	P_ID = joysticks[0].productId;
    } else if (deviceNames.length > 1) {  // multiple joysticks!
	console.error();
	console.error('There are ' + deviceNames.length + ' USB joysticks connected to this machine:\n');
	for (var i = 0; i < deviceNames.length; i++) { 
	    console.error('     ' + deviceNames[i]);
	}
	console.error('\nPlease specify the V_ID & P_ID of the robot\'s joystick on the command line\nusing the \'-j\' option (e.g. \'-j 121,6\')');
	process.exit(1);
    }	
    
} 


var hid = new HID.HID(V_ID, P_ID); // the USB joystick


// Display the local IP address(es)
// Code modified from http://stackoverflow.com/a/8440736
console.log('\nLocal IP address(es):');

for (var dev in ifaces) {
    var alias = 0;
    ifaces[dev].forEach(function(details){
	if (details.family == 'IPv4' && !details.internal) {
	    console.log("     " + dev + (alias?':'+alias:''), details.address);
	    ++alias;
	}
    });
}


io.set('log level', 1); // set the Socket.IO logging level to show warnings only

// should check that the port is within a sensible range (1..65536)
app.listen(program.port);
console.log("Listening on port: " + program.port);


// Functions for receiving data from the client via sockets
io.sockets.on('connection', function (socket) {
    
    socketConnection = socket;
    console.log("-> Connection from", socket.handshake.address.address);
    
    // Receive motor instructions
    socket.on('motors', function(data) {
	PowerInstr[5] = data.left;
	motorL = data.left;
	PowerInstr[3] = data.right;
	motorR = data.right;
	hid.write(PowerInstr);
	hid.write(TxInstr);
	logData();
	if (program.debug) {
	    console.log("-> motors: ", data.left, " ,", data.right);
	} 
    });
    
    // Receive logging enable/disable message
    socket.on('logging', function(enableLogs) {
	console.log("-> logging: ", enableLogs);
	loggingEnabled = enableLogs;
	
	console.log('logging:', loggingEnabled); 
	//console.log('filename length:', logFileName.length); 
	
	if (loggingEnabled) {
	    if (logFileName.length == 0 && (robotMode != "Undefined")) {
		logFileName = openLogFile(); // open new log file
	    }
	} else {
	    filename = ""; // effectively close the log file
	}
    });
    
    // Receive change mode message
    socket.on('mode', function(mode) {
	console.log("-> mode: ", mode); 
	robotMode = mode;
	
	if (loggingEnabled) {
	    if (mode != "Undefined") {
		logFileName = openLogFile(); // open new log file
	    }
	} else {
	    filename = ""; // effectively close the log file
	}
    });
    
    // Client disconnected
    socket.on('disconnect', function () {
	console.log("-> client disconnected."); 
    });
    
    // Receive a message from the client to display on the server console
    socket.on('message', function (message) {
	console.log("-> Lollybot: " + message); 
    });
    
});


// Handle USB data (buttons and joystick)
hid.gotData = function (err, data) {
    
    var newButtonData   = false;
    var newJoystickData = false;
    
    // Check to see if any of the joystick values have changed
    for (var i = 0; i < 5; i++) { 
	if (oldData[i] != data[i]) {
	    newJoystickData = true;
	    oldData[i] = data[i];  // store the updated values
	} 
    }
    
    // Check to see if any of the button values have changed
    for (var i = 5; i < 8; i++) { 
	if (oldData[i] != data[i]) {
	    newButtonData = true;
	    oldData[i] = data[i];  // store the updated values
	} 
    }
    
    // Extract the button values from the data -  byte 5 is shifted
    // left by 8 bits and OR'ed with byte 6 
    if (newButtonData) {
	var ButtonValue = (data[5] << 8 )| data[6];
	
	// AND the data with the appropriate bitmask to check if the button
	// is pressed
	for (var i = 0; i < 12; i++){
	    if ((ButtonValue & ButtonMask[i]) == ButtonMask[i]){
		ButtonPressed[i] = true;
	    } else {
		ButtonPressed[i] = false;
	    }
	}
	    
	// Set the analog button state  (Note that not all joysticks 
	// report the analog mode/button state)
	if (data[7] == ANALOG_STICKS) {
	    ButtonPressed[16] = true;
	} else {
	    ButtonPressed[16] = false;
	}
	
	// Check the D-pad states in Data[5] by masking out the buttons in 
	// top most 4 bits
	var DpadValue = data[5] & 0x0F;
	
	// update the button states for the D-Pad in ButtonPressed[13..16]
	for (var i = 0; i < 4; i++) {
	    if (DpadMask[i] == DpadValue) {
		ButtonPressed[i + 12] = true;
	    } else {
		ButtonPressed[i + 12] = false;
	    }
	}
	
	// Need to check for compass corners too - NE, SE, SW, NW
	if (DpadValue == NORTH_EAST) {
	    ButtonPressed[12] = true; // N
	    ButtonPressed[13] = true; // E
	} else if (DpadValue == SOUTH_EAST) {
	    ButtonPressed[14] = true; // S
	    ButtonPressed[13] = true; // E
	} else if (DpadValue == SOUTH_WEST) {
	    ButtonPressed[14] = true; // S
	    ButtonPressed[15] = true; // W
	} else if (DpadValue == NORTH_WEST) {
	    ButtonPressed[12] = true; // N
	    ButtonPressed[15] = true; // W
	};
	
	// Send the button states to the client
	if (socketConnection != null) {
	    socketConnection.emit('buttonData', {buttonStates: ButtonPressed});
	}
	
	// Display the data on the console?
	if (program.debug) {
	    console.log('USB data', data);
	    console.log('buttons:\n',  ButtonPressed);
	}
    }
    
    // Store the analog joystick values then send it to the client
    if (newJoystickData) {

	// Read Left thumbstick values
	AnalogJoyValues[0] = data[0]; // x-axis
	AnalogJoyValues[1] = data[1]; // y-axis
	
	// Read right thumbstick analog values
	AnalogJoyValues[2] = data[3]; // x-axis
	AnalogJoyValues[3] = data[4]; // y-axis
	
	// Transmit the new joystick values to the client
	if (socketConnection != null) {
	    socketConnection.emit('joystickData', {joysticks: AnalogJoyValues});
	}

	// Display the data on the console?
	if (program.debug) {
	    console.log('joysticks', AnalogJoyValues);
	}
    }

    // If there is new button or joystick data then we need to update the 
    // log file (if any)
    if (newButtonData || newJoystickData) {
	logData();
    }    
    
    this.read(this.gotData.bind(this));
}

hid.read(hid.gotData.bind(hid));
repl.context.hid = hid;


// Create a new log file in comma separated value format ('.CSV') with
// the start date, time, and mode as the file name:
//     'YYYY-MM-DD--HH-MM-SS-Mode.csv'
// and also write a header line.
function openLogFile() {
    
    // Format the date and time to build the filename
    var filename = "-" + robotMode + ".csv";
    modeStartTime = new Date(); // or should we simply set the start time to be 0 mSec?
    var logDateTime = modeStartTime.getFullYear() + '-';
    
    if ((modeStartTime.getMonth() + 1) < 10) { // add padding '0' to month
	logDateTime = logDateTime + '0';
    } 	    
    
    logDateTime = logDateTime + (modeStartTime.getMonth() + 1) + '-'; 
    
    if (modeStartTime.getDate() < 10) { // add padding '0' to day
	logDateTime = logDateTime + '0';
    } 	    
    
    logDateTime = logDateTime + modeStartTime.getDate() + '--';
    
    if (modeStartTime.getHours() < 10) { // add padding '0' to hours
	logDateTime = logDateTime + '0';
    } 	    
    
    logDateTime = logDateTime + modeStartTime.getHours() + '-';
    
    if (modeStartTime.getMinutes() < 10) { // add padding '0' to minutes
	logDateTime = logDateTime + '0';
    } 	    
    
    logDateTime = logDateTime + modeStartTime.getMinutes() + '-';
    
    if (modeStartTime.getSeconds() < 10) { // add padding '0' to seconds
	logDateTime = logDateTime + '0';
    } 	    
    
    logDateTime = logDateTime + modeStartTime.getSeconds();
    filename = logDateTime + filename;

    // create the header line
    var header = "mSec";
    
    for (var i = 0; i < 12; i++) { 
	header = header + ',B' + i;
    } 
    
    header = header + ',Up,Right,Down,Left,Analog'
	+ ',JoyL-X,JoyL-Y,JoyR-X,JoyR-Y,MotorL,MotorR\r\n';
    
    console.log('Logging data to file: \'' + filename + '\'');
    
    // appendFile creates the file if it doesn't already exist
    fs.appendFile(logDir + filename, header, function (err) {
	if (err) {	  
	    console.error();
	    console.error('Error creating log file \'' + filename +
			  '\':' + err.name);
	    console.error(err.message);
	    throw err;
	}
    });
    
    return filename;
}


// Write a row of data to the log file
// Note that this is asynchronous - and data may not be written in the
// order desired!  the first column (time) could be used to sort the
// rows if necessary.
function logData() {
    
    if (loggingEnabled && logFileName.length > 0){
	
	var now = new Date();
	var details = "";
	
	// note that the resolution of the time is system dependent
	details = details + (now - modeStartTime); // no of mSec since mode start
	//  Add button data
	for (var i = 0; i < ButtonPressed.length; i++) {
	    if (ButtonPressed[i]) {
		details = details + '1,'; // button pressed
	    } else {
		details = details + '0,'; // button not pressed
	    }
	}
	
	// Add joystick Data
	for (var i = 0; i < AnalogJoyValues.length; i++) {
	    details = details + (AnalogJoyValues[i] + ',');	
	}
	
	// Add motor power values 
	details = details + motorL + ',' + motorR + ',' + "\r\n";
	
	// Append it to the log file
	fs.appendFile(logDir + logFileName, details, function (err) {
	    if (err) {	  
		console.error();
		console.error('Error writing log data to \'' + filename +
			      '\':' + err.name);
		console.error(err.message);
		throw err;
	    }
	});
    }
}

// Notes/Thoughts:
// -------------------------------------------
//
// Add keystroke handling and a command line switch to enable it
// (e.g. -test) so that people can drive the robot using A/W/D keys
// and see joystcik/button data without a client.  The use of the REPL
// command environment may make listening for individual keys
// problematic.

// Note about closing HID when read pending on Win 7:
// https://github.com/hanshuebner/node-hid/issues/10

// Should only accept a single connection at a time (other students
// could take control of the robot). Include a command-line swicth for
// a password for authorization and add a field to the "Settings"
// panel on the client and a command line switch on the server?
//
// BE CAREFUL about the assumptions we make on initial states, etc.
// If a running client reconnects to a restarted server then the
// server is unaware of state changes re. log files, etc.  Perhaps on
// connection these should be sent from the client so they can be
// updated to avoid this problem (mode, loggingEnabled)
//
// writing to log files is asynchronous - it may be possible to get a
// line of logged data appearing before the header has been written.
//
// Do we need to do a timing run (say 1 second) and check the
// resolution on the timer (which is system dependent) and divide by
// 10 for example to get it into mS?)
//
