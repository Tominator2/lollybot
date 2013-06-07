/**
 *
 *   lollybot-control.js
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
// To Do:
// ------
// Layout bug in Chrome for the sparklines - offset down and to the left.
// Upping or decreasing the sixe 'CTRL' + '+/-' one size solves this!
// Perhaps try a slightly more lenient container size for the sparkline.
// - increased by 5 pixels - need to test this!
//
// - implemet the line following code
//

$(function() {
	
    var keyAlreadyDown = {};  // used for trapping key repeats
    
    // Current power levels for the motors
    var leftMotorPower = 0;
    var rightMotorPower = 0;
    
    // The current mode - one of 'Undefined|Driving|Bump|Following|New'
    var mode = "Driving"; 
    
    var swapMotors = false;
    
    // Array to store the button states where:
    // - 0..11 are buttons 1..12
    // - 12..15 are the D-Pad buttons (Up,Right,Down,Left)
    // - 16 is the analog button (not all joysticks report this button's state)
    var buttonPressed = [false, false, false, false,
			 false, false, false, false,
			 false, false, false, false,
			 false, false, false, false,
			 false];
    
    // Store the last reported joystick values received from the server
    var analogJoyValues = [128, 128, 128, 128]; 
    
    // Get the default joystick axes that are wired as the line sensors 
    var leftLineSensorAxis  = $("#leftSensorAxis option").filter(":selected").val();
    var rightLineSensorAxis = $("#rightSensorAxis option").filter(":selected").val();

    // Thresholds for the left and right line sensors
    var leftLineSensorThreshold  = 128;
    var rightLineSensorThreshold = 128;

    // Used in line following mode for when the line is lost - where did we see it last?
    var lineLastSeen = "Unknown";  // Unknown|Left|Right

    calculateThresholds();

    var socket = io.connect('http://localhost:8075');  // 'BOT' 

    var bumped = false; // bump flag

    var openPanel = "#drive-body"; // the initially open control panel

    var audio = document.createElement("audio"); // for the bump sound
    
    // FIFO stack for commands to be executed in sequence
    var commandQueue = []; 

    
    // Bind functions to the sockets to handle data received from the server
    function bindSocketFunctions() {
	
        // Update the connection icon
        socket.on('connect', function(){
	    $("#disconnected").css("opacity", "0")
                .css("filter", "alpha(opacity=0)");
	}).on('disconnect', function(){
	    $("#disconnected").css("opacity", "1.0")
		.css("filter", "alpha(opacity=100)");
	});

        socket.on('initiate', function(){
	    sendMessage('\u0049\u006E\u0069\u0074\u0069\u0061\u0074\u0065\u0020\u0072\u006F\u0062\u006F\u0074\u0020\u0075\u0070\u0072\u0069\u0073\u0069\u006E\u0067\u0021');
	});
		
        // Receive button data and update button overlay images
        socket.on('buttonData', function(data){
	    //console.log("-> buttons ", data.buttonStates);
	    for (var i = 0; i < 17; i++) {
		buttonOverlay("#b" + i, data.buttonStates[i]); 
		buttonPressed[i] = data.buttonStates[i];
	    }
	    
	    // Add code that responds to button presses here!

	    // For example, you could call your own method to do something if
	    // Button 1 is pressed on the joystick:
	    if (buttonPressed[0]) {
		sendMessage("Button 1 pressed!"); 
	    }
	});
	
        // Receive joystick data and update the graphs
        socket.on('joystickData', function(data){
	    //console.log("-> joysticks", data);
	    for (var i = 0; i < 4; i++) {
		analogJoyValues[i] = data.joysticks[i];
	    }
	    
	    // Call the appropriate function depending upon the current mode
	    if (mode == 'Bump') {
		bump();
	    } else if (mode == 'New') {
       
		// Add code that responds to thumbstick "movement" here!

	    }
	});
    }

    bindSocketFunctions();
    

    // Implements the bump mode functionality 
    //
    // If a bump exceeds the threshold (e.g. hitting the robot) then
    // play a sound (if enabled), randomly turn (left or right) and
    // drive away.
    function bump() {
	var threshold = $("#bumpThreshold").val();
	var axis = $("#bumpAxis option").filter(":selected").val();
	
	if (analogJoyValues[axis] < (128 - threshold) || 
	    analogJoyValues[axis] > (128 + parseInt(threshold))) {
	    if (!bumped) {
		bumped = true;   // set the bump flag
		addToQueue(function(){playBumpSound()});
		
		// turn left or right randomly
		if (Math.random() <= 0.5) {
		    addToQueue(function(){turnLeft(1500)});
		} else {
		    addToQueue(function(){turnRight(1500)});
		}
		
		// drive away a little
		//addToQueue(function(){pauseQueue(2000)});
		addToQueue(function(){moveForward(1500)});
		
		nextQueueCommand();  // process the queue
	    }
	} else {
	    bumped = false;  // reset the bump flag if we drop back inside the theshold
	}
    }


    // Implements the line following functionality
    //
    // This method is called once when the start/stop button is
    // pressed.  It relies on using motor control functions that are
    // pushed onto the command queue.  When the queue is empty then
    // the nextQueueCommand() function call "follow()' again.
    function follow() {

	// Exit if we are not in line following mode
	if (mode != "Following") {
	    clearQueue();
	    return;
	}
	    
	var leftSensor  = analogJoyValues[leftLineSensorAxis];
	var rightSensor = analogJoyValues[rightLineSensorAxis];

	if ($("#blackLine").is(":checked")) { // following a black line
	    //console.log("Following black line: " + leftSensor + ", " + rightSensor); 
	    if ((leftSensor < leftLineSensorThreshold) &&
	       (rightSensor < rightLineSensorThreshold)) { 
		lineLastSeen="Unknown";
		addToQueue(function(){moveForward(150)}); // both sensors over black (below threshold) -> go straight!
	    } else if ((leftSensor < leftLineSensorThreshold) &&
		       (rightSensor >= rightLineSensorThreshold)) { 
		lineLastSeen = "Right";
		addToQueue(function(){turnRight(150)}); // left over black, right over white -> steer right
		addToQueue(function(){moveForward(100)});
	    } else if ((leftSensor >= leftLineSensorThreshold) &&
		       (rightSensor < rightLineSensorThreshold)) { 
		lineLastSeen = "Left";
		addToQueue(function(){turnLeft(150)}); // left over white, right over black -> steer left
		addToQueue(function(){moveForward(100)});
	    } else { 
		// both over white (above threshold) -> lost the line!
		if (lineLastSeen == "Left") {
		    addToQueue(function(){turnLeft(100)});
		    addToQueue(function(){moveForward(100)});
		} else if (lineLastSeen == "Right") {
		    addToQueue(function(){turnRight(100)});
		    addToQueue(function(){moveForward(100)});
		} else {
		    sendMessage("Help! I'm lost!"); 
		    // we are sending 0 power to both motors.  The timeout
		    // will then call 'follow()' again while we are in
		    // following mode.
		    //addToQueue(function(){runMotors(0, 0, 250)});
		    addToQueue(function(){pauseQueue(250)});
		}
	    }
	} else { // following a white line
	    //console.log("Following white line: " + leftSensor + ", " + rightSensor); 
	    // steer here!

	    // The 'White' radio button in 'index.html' is currently
	    // disabled.  To enable it just remove the 'disabled'
	    // attribute from the "WhiteLine" radio button.

	}

	// Intertia keeps the robot moving which adds to overshoot so
	// we will pause the queue for a short while to help stop the
	// robot
	addToQueue(function(){pauseQueue(75)});

	// Run the commands we added to the queue.  When the Queue is empty the
	// follow() function will be called again.
	nextQueueCommand();

    }


    // Implement your own mode here!
    function newMode() {
	// have a look at the bump() function above for ideas.

    }


    // Number input validator for the port field
    // code from: http://stackoverflow.com/a/2232838
    $(".numeric").keypress(function(event) {
	// Backspace, tab, enter, end, home, left, right
	// We don't support the del key in Opera because del == . == 46.
	var controlKeys = [8, 9, 13, 35, 36, 37, 39];
	// IE doesn't support indexOf
	var isControlKey = controlKeys.join(",").match(new RegExp(event.which));
	// Some browsers just don't raise events for control keys. Easy.
	// e.g. Safari backspace.
	if (!event.which || // Control keys in most browsers. e.g. Firefox tab is 0
	    (49 <= event.which && event.which <= 57) || // Always 1 through 9
	    (48 == event.which && $(this).attr("value")) || // No 0 first digit
	    isControlKey) { // Opera assigns values for control keys.
	    return;
	} else {
	    event.preventDefault();
	}
    });
    

    // Use a regular expression to check for valid URLs
    // Code from StackOverflow: http://stackoverflow.com/a/2723190
    function isValidURL(url) {
	if(/^(http|https):(\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?((\[(|(v[\da-f]{1,}\.(([a-z]|\d|-|\.|_|~)|[!\$&'\(\)\*\+,;=]|:)+))\])|((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=])*)(:\d*)?)(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*|(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)|((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)|((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)){0})(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(url)) { 
	    return true;	
	} else {
	    return false;
	}
    }

    
    // write log file?
    $("#loggingCheckbox").click(function() {
	socket.emit('logging', $(this).is(":checked"));
    });

	
    // swap motors
    $("#loggingCheckbox").click(function() {
	swapMotors = $(this).is(":checked");
    });

    
    // connect to different server
    // - should do some validation to check the port no. & range
    $("#connectButton").click(function() {
	var port = $("#serverPort").val(); // 1..65535			
	var url = $("#serverURL").val(); 
	if (url.indexOf("http",0) == -1) {
	    url = "http://" + url; 
	}
	
	if (!isValidURL(url)) {
	    alert("Invalid server URL!\n(enter a valid URL like 'localhost'" +
		  "or 'http://127.0.0.1')");
	} else if (port < 1 || port > 65535) {
	    alert("Invalid port number!\n(default port is 8057)");
	} else {
	    socket.emit('disconnect');
	    socket = io.connect(url + ':' + port);
	    bindSocketFunctions();
	}
    });


    // Mouse click handling for driving mode
    $("#up-off").mousedown(function() {
	drive(this, 255, 255);
    }).mouseup(function() {
	stopDriving(this);
    });
    
    $("#left-off").mousedown(function() {
	drive(this, 255, 0);
    }).mouseup(function() {
	stopDriving(this);
    });
    
    $("#right-off").mousedown(function() {
	drive(this, 0, 255);
    }).mouseup(function() {
	stopDriving(this);
    });

    
    // Key handling for driving 
    // (should have a flag for "in driving" mode) 
    $(document).keydown(function(evt) {
	if (keyAlreadyDown[evt.which] == null) {
	    if (evt.which == 87) { // 'W'
		drive("#up-off", 255, 255);
	    } else if (evt.which == 65) { // 'A'  
		drive("#left-off", 255, 0);
	    } else if (evt.which == 68) { // 'D' or
		drive("#right-off", 0, 255);
	    }
	    keyAlreadyDown[evt.which] = true;
	}
    }).keyup(function(evt) {
	keyAlreadyDown[evt.which] = null;
	if (evt.which == 87){ 
	    stopDriving("#up-off");
	} else if (evt.which == 65) { 
	    stopDriving("#left-off");
	} else if (evt.which == 68) {
	    stopDriving("#right-off");
	}
    });


    // Turn on drive arrow images
    // This just makes the "off" arrow transparent to show the 
    // "on" arrow which is underneath
    function driveArrowDown(image) {              
	$(image).css("opacity", "0")
	    .css("filter", "alpha(opacity=0)");
    }

    
    // Turn off drive arrow images
    // This just makes the "off" arrow opaque to hide the 
    // "on" arrow which is underneath
    function driveArrowUp(image) {              
	    $(image).css("opacity", "1.0")
	    .css("filter", "alpha(opacity=100)");
    }

    
    // Drive by turning the motors on
    function drive(arrowImage, leftPower, rightPower) { 
        if (mode == "Driving") {
	    leftMotorPower  = leftPower;
	    rightMotorPower = rightPower;
	    sendMotorPower();
	    driveArrowDown(arrowImage);
        }
    }

    
    // Stop the motors and restore the "off" arrow image!
    function stopDriving(arrowImage) { 
        if (mode == "Driving") {
	    stopMotors();
	    driveArrowUp(arrowImage);
        }
    }

    
    // Transmit power to motors and update the images
    function sendMotorPower() {
	
	// check for motor swap
	if ($("#swapCheckbox").is(":checked")) {
	    var temp = leftMotorPower;
	    leftMotorPower = rightMotorPower;
	    rightMotorPower = temp;
	}
	
	// send data to the server
	socket.emit('motors',{left: leftMotorPower, right: rightMotorPower});
	// turn on appropriate UI images
	buttonOverlay("#b18", leftMotorPower > 0);
	buttonOverlay("#b17", rightMotorPower > 0);
    }
    

    // toggle button overlays
    function buttonOverlay(buttonNo, isPressed) {
	if (isPressed) {
	    $(buttonNo).css("visibility", "visible");
	} else {
		$(buttonNo).css("visibility", "hidden");
	} 
    }
    
    
    // Draw analog joystick graphs
    // This code is adapted from the Sparlines mousspeed example:
    // 
    function drawJoystickData() {
	
	var refreshinterval = 66; // update display in mS (original demo 500mS)
	
	// Arrays to store the analog joystick graph data
	var leftXpoints  = [];
	var leftYpoints  = [];
	var rightXpoints = [];
	var rightYpoints = [];
	var points_max = 45;  // on screen for approx. 3 seconds at 66mS
	
	// pre-populate the graphs with data so scrolling starts from the right
	for (var i = 0; i < points_max; i++){
	    leftXpoints[i]  = analogJoyValues[0];	  
	    leftYpoints[i]  = analogJoyValues[1];	  
	    rightXpoints[i] = analogJoyValues[2];	  
	    rightYpoints[i] = analogJoyValues[3];	  
	}
	
	function graphDraw() {
	    
	    // Sparkline optons for the x-axis graphs (red)
	    var redGraphSettings = { width: points_max*2, 
				     height: 51, 
				     chartRangeMin: 0, 
				     chartRangeMax: 255, 
				     chartRangeClip: true, 
				     minSpotColor: false, 
				     maxSpotColor: false, 
				     fillColor: false, 
				     lineColor: '#FF0000'};

	    // Sparkline optons for the y-axis graphs (blue)
	    var blueGraphSettings = { width: points_max*2, 
				      height: 51, 
				      chartRangeMin: 0, 
				      chartRangeMax: 255, 
				      chartRangeClip: true, 
				      minSpotColor: false, 
				      maxSpotColor: false, 
				      fillColor: false, 
				      lineColor: '#0000FF'};
	    
	    // add the latest data to the end of the array
	    leftXpoints.push(analogJoyValues[0]);
	    leftYpoints.push(analogJoyValues[1]);
	    rightXpoints.push(analogJoyValues[2]);
	    rightYpoints.push(analogJoyValues[3]);
	    
	    // scroll the graph by removing the first data point
	    if (leftXpoints.length > points_max) {
		leftXpoints.splice(0,1);
		leftYpoints.splice(0,1);
		rightXpoints.splice(0,1);
		rightYpoints.splice(0,1);
	    }
	    
	    // Attach the Sparklines to the corresponding <SPAN> HTML elements
	    $('#left-x').sparkline(leftXpoints, redGraphSettings);            
	    $('#left-y').sparkline(leftYpoints, blueGraphSettings);
	    $('#right-x').sparkline(rightXpoints, redGraphSettings);            
	    $('#right-y').sparkline(rightYpoints, blueGraphSettings);
	    
	    setTimeout(graphDraw, refreshinterval);
	}

	// We could use setInterval instead, but I prefer to do it this way
	setTimeout(graphDraw, refreshinterval);
	
    };
    
    drawJoystickData();

	
    // send a message that will be displayed on the server's console
    function sendMessage(message){
	socket.emit('message', message);
    };
    

    // open and close the control panels
    function changePanels(panel) {
	// should also check not in bump or following modes!
	if ($(panel).is(":hidden") && (mode == "Driving" || mode == "Undefined")) {
	    $(openPanel).slideToggle("slow"); // close the open panel
	    openPanel = panel;
	    $(panel).slideToggle("slow"); // open this panel
	    changeMode("Undefined");
	    return true;
	} else {
	    return false;
	}
	
    };

	
    // Set the new mode and notify the server
    function changeMode(newMode){
	if (newMode != mode) {
	    mode = newMode;
	    socket.emit('mode', mode);
	    }
    };

    
    // Drive mode panel open
    $("#drive-header").click(function() {
	if (changePanels("#drive-body")) {
	    changeMode("Driving"); // set mode and TX to server
	}
    });

    
    // Bump mode panel open
    $("#bump-header").click(function() {
	changePanels("#bump-body");
    });

    
    // Line following panel open
    $("#following-header").click(function() {
	changePanels("#following-body");
    });

    
    // Your mode panel open
    $("#new-header").click(function() {
	changePanels("#new-body");
    });

    
    // Settings panel open
    $("#settings-header").click(function() {
	changePanels("#settings-body");
    });


    // Information panel open
    $("#info-header").click(function() {
	changePanels("#info-body");
    });

    
    // Modes
    
    // Bump Mode running animation on/off
    // Add some visual feedback or a note so users know they can't
    // change panels until they stop this mode?
    $("#bumpButton").click(function() {
	if (mode == "Undefined"){
	    changeMode("Bump");
	    $("#bumpButton").html('Stop');
	    $("#bump-scan").css("visibility", "visible"); // show animation
	} else if (mode == "Bump"){
	    changeMode("Undefined");
	    $("#bumpButton").html('Start');	
	    $("#bump-scan").css("visibility", "hidden"); // hide animation
	}
    });
    
    
    // Line Following Mode running animation on/off
    $("#followButton").click(function() {
	if (mode == "Undefined"){
	    changeMode("Following");
	    $("#followButton").html('Stop');			    
	    $("#following-scan").css("visibility", "visible"); // show animation
	    follow();
	} else if (mode == "Following"){
	    changeMode("Undefined");
	    $("#followButton").html('Start');			    
	    $("#following-scan").css("visibility", "hidden"); // hide animation
	}
    });
    

    // Your Mode running animation on/off
    $("#newButton").click(function() {
	if (mode == "Undefined"){
	    changeMode("New");
	    $("#newButton").html('Stop');			    
	    $("#new-scan").css("visibility", "visible"); // show animation
       
	    // Add code to be run when the "Start" button is pressed here!
       
	} else if (mode == "New"){
	    changeMode("Undefined");
	    $("#newButton").html('Start');			    
	    $("#new-scan").css("visibility", "hidden"); // hide animation
	    clearQueue(); // clear any commands currently queued
	}
    });

    
    function queueTest() {
	// push some commands onto the queue and then execute them
	addToQueue(function(){playBumpSound()});
	addToQueue(function(){turnLeft(1500)});
	addToQueue(function(){playBumpSound()});
	addToQueue(function(){turnRight(1500)});
	addToQueue(function(){playBumpSound()});
	addToQueue(function(){moveForward(1500)});
	addToQueue(function(){playBumpSound()});
	nextQueueCommand();  // process the queue
    }


    // Audio
    
    // Test the bump sound
    $("#playBumpSound").click(function() {
	playBumpSound();
    });

    
    // Change the state of the bump sound flag
    $("#bumpSoundCheckbox").click(function() {
	enableBumpSound($(this).is(":checked"));
    });

    
    // Enable/disable the bump sound widgets
    // note that this could be more elegant if we simply get the div's 
    // child elements and change their text color
    function enableBumpSound (enabled) {
	if (enabled) {
	    $("#playBumpSound").css("opacity", "1.0")
		.css("filter", "alpha(opacity=100)");
	    $("#soundChooser").css("color","#000000");
	    $("#soundPicker").prop('disabled',false);
	} else { 
	    $("#playBumpSound").css("opacity", "0.4")
		.css("filter", "alpha(opacity=40)");
	    $("#soundChooser").css("color","#AAAAAA");
	    $("#soundPicker").prop('disabled',true);
	}
    };
    
    // initially set 'use bump sound' to false
    enableBumpSound(false);
    
    // This will reset the 'bump sound' checkbox if the page is reloaded
    // to make sure it is consistent with the enabled/disabled state of 
    // the other widgets. 
    //
    // Not sure if this works consistently?			    
    $('body').bind('beforeunload',function(){
	$("#bumpSoundCheckbox").prop('checked', false); 
    });
    

    // Attach a change handler to the file-input field
    $("#soundPicker").change(onFileSelected);
    
    function onFileSelected(e) {
        // Get a File object representing the selected file
        var file = e.target.files[0];
	
        // Make sure it's an image file
        if (!file.type.match("audio.*")) {
            alert("\"" + file.name + "\" is not a supported audio file ("+ file.type + ")");
            return;
        }
	
        // Create a FileReader object and read the file's contents
        var reader = new FileReader();
	
        reader.onload = function (e) {
	    
            //audio.onload = function () {}
		
            // Point the image to the file that the user selected
            audio.src = e.target.result;
        }
	
        // Read the contents of the audio file as a data URL
        reader.readAsDataURL(file); 
    }
    
    
    function playBumpSound() {
	if ($("#bumpSoundCheckbox").is(":checked")) {
	    // do we need to check if file is already loaded?
	    audio.play();
        }
	nextQueueCommand();	    
    }


    // Remove the command on the front of the queue and run it (if any)
    function nextQueueCommand() {
	if (commandQueue.length > 0) {   // commands on queue
	    commandQueue.shift().call();
	} else {                         // queue is empty!
	    if (mode == "Following") {
		follow();
	    }
	}
    }

    
    // This adds a command to the end of the queue.  It could be a
    // little more elegant but like this:
    //      commandQueue.push(function(){fn}); 
    // doesn't work reliably.
    function addToQueue(fn) {
	//commandQueue.push(function(){fn});
	commandQueue.push(fn);
    }


    // This command empties the queue.  Any commands that have not
    // already started running will not be run.
    function clearQueue() {
	commandQueue.length = 0;
    }



    // drive forward for 'milliSec' milliseconds
    function moveForward(milliSec) {
	return runMotors(255, 255, milliSec);
    }


    // turn left for 'milliSec' milliseconds
    function turnLeft(milliSec) {
	return runMotors(255, 0, milliSec);
    }


    // drive forward for 'milliSec' milliseconds
    function turnRight(milliSec) {
	return runMotors(0, 255, milliSec);
    }


    // Run the motors at the requested power levels for 'milliSec'
    // milliseconds.  It returns true if the command could be started
    // and false if the motors were already running in which case the
    // request is ignored.
    function runMotors(leftPower, rightPower, milliSec) {
	if (leftMotorPower > 0 || rightMotorPower > 0) {
	    return false; // motors are already running
	} else {
	    leftMotorPower  = leftPower;
	    rightMotorPower = rightPower;
	    sendMotorPower();
	    setTimeout(function(){stopMotors()}, milliSec);
	    return true; 
	}
    }


    // Stop both motors and run the next command in the queue (if any)
    function stopMotors() {
	leftMotorPower  = 0;
	rightMotorPower = 0;
	sendMotorPower();

	if (mode != "Driving") {
	    nextQueueCommand();
	}

    }


    // pause execution of commands in the queue for 'milliSec' milliseconds
    function pauseQueue(milliSec){
	setTimeout(function(){nextQueueCommand()}, milliSec);
    }
    

    // Line Following GUI functionality

    // Update the left sensor white level via the "Detect" button
    $("#leftWhiteLevelButton").click(function() {
	var axis = $("#leftSensorAxis option").filter(":selected").val();
	$("#leftWhiteLevel").val(analogJoyValues[axis]);
	calculateThresholds();
    });   


    // Update the left sensor black level via the "Detect" button
    $("#leftBlackLevelButton").click(function() {
	var axis = $("#leftSensorAxis option").filter(":selected").val();
	$("#leftBlackLevel").val(analogJoyValues[axis]);
	calculateThresholds();
    });   


    // Update the right sensor white level via the "Detect" button
    $("#rightWhiteLevelButton").click(function() {
	var axis = $("#rightSensorAxis option").filter(":selected").val();
	$("#rightWhiteLevel").val(analogJoyValues[axis]);
	calculateThresholds();
    });   


    // Update the right sensor black level via the "Detect" button
    $("#rightBlackLevelButton").click(function() {
	var axis = $("#rightSensorAxis option").filter(":selected").val();
	$("#rightBlackLevel").val(analogJoyValues[axis]);
	calculateThresholds();
    });   


    // update which joystick axis is used as the left line sensor
    $("#leftSensorAxis").change(function() {
	leftLineSensorAxis  = $("#leftSensorAxis option").filter(":selected").val();
    });


    // update which joystick axis is used as the right line sensor
    $("#rightSensorAxis").change(function() {
	rightLineSensorAxis  = $("#rightSensorAxis option").filter(":selected").val();
    });


    // Calculate the threshold values for the left and right line sensors
    function calculateThresholds () {

	leftLineSensorThreshold = (parseInt($("#leftWhiteLevel").val()) + parseInt($("#leftBlackLevel").val()))/2;
	rightLineSensorThreshold = (parseInt($("#rightWhiteLevel").val()) + parseInt($("#rightBlackLevel").val()))/2;


	//leftLineSensorThreshold = parseInt($("#leftBlackLevel").val()) + 10;
	//rightLineSensorThreshold = parseInt($("#leftBlackLevel").val()) + 10;

    }

});

