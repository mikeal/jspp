var server = require('./server')
  , http = require('http')
  ;

exports.createListener = server.createListener;
exports.createServer = function (path, cb) {
  exports.createListener(path, function (l) {
    var s = http.createServer(l);
    cb(s);
  })
}