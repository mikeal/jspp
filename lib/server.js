var http = require('http')
  , fs = require('fs')
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
    cb(function (req, resp) {
      if (req.url === '/__jspp/jquery.js') {
        resource.createResource(path.join(__dirname, 'jquery.js'), function (res) {
          res.request(req, resp)
        });
        return;
      } else {
        var f = path.join(dir, req.url);
      }
      if (f[f.length - 1] == '/') f = f.slice(0, f.length - 1)
      if (monitor.files[f] && monitor.files[f].isDirectory()) f = path.join(f, 'index.html')
      if (monitor.files[f]) {
        if (resources[f]) resources[f].request(req, resp);
        else {
          resource.createResource(f, function (res) {
            resources[f] = res;
            resources[f].request(req, resp);
          })
        }
      } else {
        console.log('[404] '+f+' not found')
        responses.fileNotFound(req, resp);
      }
    })
  })
}

createListener(path.join(__dirname, '..', 'test'), function (l) {
  http.createServer(l).listen(8888);
  console.log('Serving on 8888.');
})