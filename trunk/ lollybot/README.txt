Lollybot HTML5 + JavaScript Telemetry & Control 
Version 0.2.1
June 25, 2014

This is the software for Lollybot (formerly known as "Suckerbot") my
entry in the African Robotics Network (AFRON) $10 Robot Design
Challenge:

http://www.robotics-africa.org/afron-design-challenges/10-dollar-robot-design-challenge.html

Suckerbot was a submission in the tethered robot category.  The robot
is connected to a computer via a USB cable where both the computing
and the programming take place.  You can find more details online at: 

http://www.tomtilley.net/projects/suckerbot/ 

This software is Open Source and the code is released under the GNU
Public License. You can download the software which includes the source at:

https://code.google.com/p/lollybot/


OVERVIEW:
---------
The telemetry and control code consists of two parts:

1) A JavaScript server running on Node.js that communicates with the
   joystick via USB, and

2) An HTML5 + JavaScript client that runs in a web browser. You can
   visit a live version of the client page at:

   http://tomtilley.net/projects/suckerbot/html5


REQUIREMENTS:
-------------
- Mac OS (10.6.8), Linux (kernel 2.6+) or Windows XP+

- Node.js v0.9.1 (http://nodejs.org/dist/v0.9.1/)
    - with the following plug-ins installed (see below for more information)
      	 - commander (https://npmjs.org/package/commander)
      	 - Socket.IO v0.9.13 (http://socket.io/) 
                     Note that Socket.IO has been updated and newer versions 
                     won't work!
         - node-hid  (https://github.com/hanshuebner/node-hid)	  

- a modern, HTML5 compliant web-browser: 
    - Chrome 6+ 	
    - Firefox 3.6+ 
    - IE9+ 
    - Opera 10+
    - Safari 5+ 


GETTING STARTED - Windows:
-------------------------
1) Install Node.js version 0.9.1 for Windows:

     http://nodejs.org/dist/v0.9.1/node-v0.9.1-x86.msi

2) Open a node.js command prompt and change into the
   directory containing this README file, e.g.:

     cd lollybot\
     
3) Install the required plug-ins for Node.js by typing:

     npm config set strict-ssl false
     npm install commander
     npm install socket.io@0.9.13

4) The software comes with a pre-built version of the node-hid plugin
   for windows ('Hid.node') that has been tested on WinXP and Windows 7
   so you don't need to install it.

5) Connect the robot's USB cable to the computer then start the server 
   by typing:

     node lollybot-server

   (for a list of available options type: node lollybot-server --help)

6) Open the 'index.html' file in a modern web browser (see
   'requirements' above) or point your browser at: 

     http://tomtilley.net/projects/suckerbot/html5/

7) The Lollybot's speech bubble at the top of the screen should change
   from a red cross to a green tick when you are connected to the
   server.  The robot is initially in driving mode but you can change
   modes by clicking the panels on the right side of the screen.  If
   the speech bubble remains a red cross try refreshing the page or
   see 'troubleshooting" below.


GETTING STARTED - Mac OS/Linux:
-------------------------------

1) Install Node.js version 0.9.1 (available at http://nodejs.org/dist/v0.9.1/)
   (see: http://code.google.com/p/lollybot/wiki/LinuxBuild for more details
   about installing Node.js with Ubuntu 12.04)

2) Open a terminal and then change into the directory containing this
   README.txt file, e.g.:

     cd lollybot/

3) Install the required plug-ins by typing:

     npm config set strict-ssl false
     npm install commander
     npm install socket.io@0.9.13

4) Before installing the node-hid plug-in make sure you also have:

     git (Mac OS & Linux)
     libudev-dev (Linux only) 
     libusb-1.0-0-dev (Ubuntu versions missing 'libusb.h' only)

   then type:

     npm install node-hid

   For additional help see:

     https://github.com/hanshuebner/node-hid
     http://code.google.com/p/lollybot/wiki/LinuxBuild

5) Connect the robot's USB cable to the computer and start the server
   by typing:

     sudo node lollybot-server

   then enter the the required password (for 'sudo').

   (for a list of available options type: 'sudo node lollybot-server --help')

6) Open the 'index.html' file in a modern web browser (see
   'requirements' above) or point your browser at: 

     http://tomtilley.net/projects/suckerbot/html5/

7) The Lollybot's speech bubble at the top of the screen should change
   from a red cross to a green tick when you are connected to the
   server.  The robot is initially in driving mode but you can change
   modes by clicking the panels on the right side of the screen.  If
   the speech bubble remains a red cross try refreshing the page or
   see 'troubleshooting" below.


TROUBLESHOOTING:
----------------

- Try refreshing the page in your browser.

- This version of the software was written and tested with Node.js
  version 0.9.1.  If you are getting weird errors related to modules
  or files not found when starting the server then please check that
  you are using node.js version 0.9.1 by typing
  
    node -v

- If the server reports that it cannot check out the USB device on
  Linux or MacOS make sure that you are running as root or use: 

    sudo node lollybot-server

- The "bump" and "line following" modes require the joystick to be in
  "analog" mode - press the "Analog" button on the joystick make sure
  the red LED is lit.

- You start and stop the 'bump', 'line following', or 'your mode' modes
  with the 'Start/Stop' button.  A Lollybot animation will play at the
  top of the panel while the mode is running.  You must stop the mode
  before you can change panels.

- If you are trying to connect to a Lollybot server running on a
  different machine you can enter the server name or IP address and
  port number in the settings panel then press 'Connect'.  Make sure
  that your firewall will allow the connection through.
  
- If the red cross doesn't change to a green tick as per step 7 above then 
  check the JavaScript console in your browser.  If it displays:
  
  Failed to load resource: the server responded with a status of 400 (Bad Request) 
  
  then you may be using a more recent version of Socket.io which does not
  work with his version of the code.  You can uninstall and reinstall a working 
  version of Scoket.io by following step 2 above and then typing:
  
    npm uninstall socket.io
    npm install socket.io@0.9.13

- Check the Lollybot Wiki page for issues at Google Code: 

    http://code.google.com/p/lollybot/w/list


CHANGE LOG:
-----------
v0.2.1
- Updated the installation instructions which break with newer versions
  of Socket.IO and to workaround the expired SSL certificate problem
  when installing plug-ins. 

v0.2.0
- Implemented a basic line following mode.  Note that the current
  position of the line sensors underneath the robot makes it easy for
  the robot to lose the line.  I will update the plans for the robot
  soon to bring the line sensors further forward.

v0.1.2
- Minor typo fixes throughout
- Added a buttonPressed array to the client for storing button states.

v0.1.1
- Changed the name of the client JavaScript file to lollybot-control.
- Added a new clearQueue() command.

v0.1.0
- This is the initial release!
