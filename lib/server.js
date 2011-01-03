var http = require('http')
  , fs = require('fs')
  , url = require('url')
  , watch = require('watch')
  , path = require('path')
  , resource = require('./resource')
  , responses = require('./responses')
  , spawn = require('child_process').spawn
  ;
  
var pstimeout = null;
function playsound () {
  if (!pstimeout) {
    pstimeout = setTimeout(function () {
      spawn("/usr/bin/afplay", ["/System/Library/Sounds/Blow.aiff"]);
      pstimeout = null;
   }, 10);
  }
}

function createListener (dir, cb) {
  watch.createMonitor(dir, function (monitor) {
    var resources = {};
    monitor.on('changed', function (f, s) {
      delete resources[f];
      console.log("[change] "+f+" resource is reset.");
      playsound();
    })
    monitor.on('removed', function (f, s) {
      delete resources[f];
      console.log("[removed] "+f+" resource is reset.");
      playsound();
    })
    var listener = function (req, resp) {
      if (req.url === '/__jspp/jquery.js') {
        resource.createResource(path.join(__dirname, 'jquery.js'), function (res) {
          res.request(req, resp)
        });
        return;
      } 
      
      var u = '';
      if (req.connection.verifyPeer) u += 'https://' 
      else u += 'http://'
      
      if (req.headers.host) u += req.headers.host + ''
      else u += 'localhost'
      
      u += req.url
      u = url.parse(u)
      // Shed the querystring and prefix with dir for full file path
      var p = path.join(dir, u.pathname)
      
      if (p[p.length - 1] == '/') p = p.slice(0, p.length - 1)
      if (monitor.files[p] && monitor.files[p].isDirectory()) p = path.join(p, 'index.html')
      if (monitor.files[p]) {
        // Cache by url, not by file path.
        if (resources[u.href]) resources[u.href].request(req, resp);
        else {
          resource.createResource(p, u, function (res) {
            resources[u.href] = res;
            resources[u.href].request(req, resp);
          })
        }
      } else {
        console.log('[404] '+p+' not found')
        responses.fileNotFound(req, resp);
      }
    }
    listener.monitor = monitor;
    cb(listener)
  })
}

exports.createListener = createListener;

