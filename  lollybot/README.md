Lollybot Telemetry and Control
==============================

This is a cross-platform JavaScript + HTML5 version of the control and telemetry code for [Lollybot](http://tomtilley.net/projects/lollybot) (formerly known as "Suckerbot") - my entry in the [African Robotics Network (AFRON)](http://www.robotics-africa.org/") [10 Dollar Robot" Design Challenge](http://www.robotics-africa.org/afron-design-challenges/10-dollar-robot-design-challenge.html). 

Lollyot is a tethered robot made from a hacked USB joystick.  The telemetry and control code consists of two parts:
 *   a JavaScript server running on [Node.js](http://nodejs.org/) that communicates with the joystick via USB using [node-hid](https://github.com/hanshuebner/node-hid) and... 
 *   an HTML5 + JavaScript client that runs in a web browser.  You can visit a live version of the client page [here](http://tomtilley.net/projects/suckerbot/html5) or click on the image below.

[![Screenshot](https://cloud.githubusercontent.com/assets/4344677/7550074/88494e12-f67d-11e4-9af8-ce391f643913.jpg])(http://tomtilley.net/projects/suckerbot/html5/) 

In the Wiki you will find some information to help you get started [writing your own control mode for Lollybot](https://code.google.com/p/lollybot/wiki/ControllingLollybot).

The [original telemetry and control code](https://github.com/Tominator2/suckerbot) was written using Delphi and is only for Windows.

This project was originally hosted on [Google code](https://code.google.com/p/lollybot/). 
