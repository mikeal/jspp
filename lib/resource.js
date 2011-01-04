var jsdom = require('jsdom')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , util = require('util')
  , events = require('events')
  , crypto = require('crypto')
  , mimetypes = require('./mimetypes')
  , responses = require('./responses')
  , evalcx = process.binding('evals').Script.runInNewContext
  , jquery = fs.readFileSync(path.join(__dirname, 'jquery.js')).toString();
  ;
  
DEFAULT_TIMEOUT = 10 * 1000

var copy = function (obj) {
  var r = {}
  for (i in obj) {
    r[i] = obj[i];
  }
  return r;
}
  
var TimedCallback = function (options, cb) {
  var start = new Date()
    , cb = cb
    , timeout = setTimeout(
      function () {
        if (options.response) responses.error(options);
        else {throw new Error(options.message)};
      }
      , DEFAULT_TIMEOUT
      )
    ;
  
  this.finish = function () {
    clearTimeout(timeout);
    cb.apply(cb, arguments);
  }
}
  
var Resource = function (filename, url, cb) {
  this.filename = filename;
  this.url = url;
  this.cacheResponse = {hash:null};
  this.init(cb)
}
util.inherits(Resource, events.EventEmitter);
Resource.prototype.init = function (cb) {
  var self = this;
  this.contentType = mimetypes.lookup(path.extname(this.filename).slice(1))
  fs.readFile(self.filename, function (err, data) {
    if (err) throw err;
    self.data = data;
    self.dataString = data.toString();
    var md5 = crypto.createHash('md5');
    md5.update(self.data);
    self.dataHash = md5 = md5.digest('hex');
    self.processinit(function () {
      self.preprocess()
      if (self.parts.length == 0 && !self.cache) {
        self.cache = self.fileCache
      } else if (!self.cache) {
        self.cache = function (hash, cb) {
          cb(null);
        }
      }
      cb(self);
    })
  })
}
Resource.prototype.fileCache = function (hash, callback) {
  callback(this.dataHash);
}
Resource.prototype.processinit = function (cb) {
  if (this.dataString.indexOf('<?jspp.init') !== -1) {
    var i = this.dataString.indexOf('<?jspp.init')
      , src = this.dataString.slice(i + '<?jspp.init'.length, this.dataString.indexOf('?>', i))
      , end = cb
      , source = '(function(end){'+src+'})'
      , resource = this
      , _require = function (name) {
        if (name[0] === '.') name = path.normalize(path.join(path.dirname(resource.filename), name))
        return require(name);
      }
      ;
    this.dataString = this.dataString.slice(0, i) + this.dataString.slice(this.dataString.indexOf('?>', i)+'?>'.length);
    var tc = new TimedCallback(
      { resource: resource
      , message: "Timeout in processing jspp.ini in "+this.filename
      }, cb)
      ;
    evalcx(source, {resource: resource, console: console, require:_require}, this.filename)(tc.finish);
  } else {
    cb();
  }
}
Resource.prototype.preprocess = function () {
  var start 
    , s = this.dataString
    ;
  this.parts = []
  while (s.indexOf('<?jspp') != -1) {
    start = s.indexOf('<?jspp');
    this.parts.push( 
      { start: start 
      , type: "inline"
      , src: s.slice(start+'<?jspp'.length, s.indexOf('?>', start))
      })
      ;
    s = s.slice(0, start) + s.slice(s.indexOf('?>'));
    s = s.replace('?>', '');
  }
  this.dataString = s;
}
Resource.prototype.respond = function (req, resp) {
  var resource = this;
  if (req.headers['if-none-match'] && req.headers['if-none-match'] == resource.cacheResponse.hash) {
    resource.cacheResponse.headers['content-length'] = 0;
    resp.writeHead(304, resource.cacheResponse.headers);
    resp.end();
  } else {
    resource.cacheResponse.headers['content-length'] = resource.cacheResponse.buffer.length;
    resp.writeHead(200, resource.cacheResponse.headers);
    resp.write(resource.cacheResponse.buffer);
    resp.end();
  }
}
Resource.prototype.request = function (req, resp) {
  var resource = this
    , page = {}
    , cacheCtx = {page:page, request:req, response:resp}
    ;
  resource.cache.apply(cacheCtx, [resource.cacheResponse.hash, function (hash) {
    if (hash !== null && hash == resource.cacheResponse.hash) {
      // Serve from cache
      resource.respond(req, resp);
    } else {
      var responseString = resource.dataString.slice(0)
        , i = 0
        , headers = {'content-type': resource.contentType}
        ;  
      
      var partSlices = {}
      
      var end = function () {
        i++;
        if (i >= resource.parts.length) {
          // Pull the slices from write() in to the response
          var respStr = ''
            , o =  0
            ;
          for (i in partSlices) {
            i = parseInt(i);
            respStr += responseString.slice(o, i)
            respStr += partSlices[i]
            o = i
          }
          respStr += responseString.slice(o);
          // Build full response.
          resource.cacheResponse = 
            { headers: headers
            , string: responseString
            , buffer: new Buffer(respStr)
            , hash: hash
            }
          if (hash) headers.etag = hash;
          resource.respond(req, resp);
        }
      }

      resource.parts.forEach(function (part) {
        var env = 
          { resource: resource
          , request: req
          , response: resp
          , console: console
          , page: page
          }
        env.require = function (name) {
          if (name[0] === '.') name = path.normalize(path.join(path.dirname(resource.filename), name));
          return require(name);
        }
        env.write = function (chunk) {
          partSlices[part.start] += chunk;
        }
        var cbopts = copy(env)
          , tc = new TimedCallback(cbopts, end)
          ;
        cbopts.partSource = part.src 
        cbopts.message = "Timeout in jspp part.";
        partSlices[part.start] = '';
        evalcx('(function (end) {' + part.src + '})', env, resource.filename)(tc.finish);
      })
      if (resource.parts.length === 0) end();  
    }
  }])
}

var HtmlResource = function (filename, url, cb) {
  Resource.apply(this, arguments);
  this.contentType = 'text/html';
}
util.inherits(HtmlResource, Resource);
HtmlResource.prototype.preprocess = function () {
  var start 
    , s = this.dataString
    , self = this
    ;
  this.parts = [];
  while (s.indexOf('<?jspp') != -1) {
    start = s.indexOf('<?jspp');
    this.parts.push(
      { start: start
      , type: "inline"
      , src: s.slice(start+'<?jspp'.length, s.indexOf('?>', start))
      , id: 'jspp-fragment-inline-'+start
      })
      ;
    s = s.slice(0, start) + s.slice(s.indexOf('?>'));
    s = s.replace('?>', '<div id="jspp-fragment-inline-'+start+'"></div>');
  }
  this.dataString = s
  
  var window = this.jQueryify()
    , scriptBlocks = []
    , $ = window.$
    ;
  $('script[type="application/jspp"]').each(function (i, elem) {
    var i = window.document.innerHTML.indexOf(elem.textContent)
      ;
    $(elem).replaceWith('<div id="jspp-fragment-script-'+i+'"></div>');
    self.parts.push(
      { start: i
      , type: "inline"
      , src: elem.textContent
      , id: 'jspp-fragment-script-'+i
      })
      ;
  })
  this.dataString = window.document.innerHTML;
}
HtmlResource.prototype.getdom = function () {
  var features = 
    { FetchExternalResources   : []
    , ProcessExternalResources : false
    }
    , window = jsdom.jsdom(this.dataString, null, {features:features}).createWindow()
    ;
  return window 
}
HtmlResource.prototype.jQueryify = function () {
  var window = this.getdom();
  evalcx(jquery, window, path.join(__dirname, 'jquery.js'));
  return window
}
HtmlResource.prototype.request = function (req, resp) {
  var resource = this
    , page = {}
    , cacheCtx = {page:page, request:req, response:resp}
    ;  
  resource.cache.apply(cacheCtx, [resource.cacheResponse.hash, function (hash) {
    if (hash !== null && hash == resource.cacheResponse.hash) {
      // Serve from cache
      resource.respond(req, resp);
    } else {
      var window = resource.jQueryify()
        , i = 0
        , headers = {'content-type': resource.contentType}
        ;
      window.resource = resource;
      window.request = req;
      window.response = resp;
      window.page = page;
      window.window = window;
      window.console = console;  
      window.require = function (name) {
        if (name[0] === '.') name = path.normalize(path.join(path.dirname(resource.filename), name))
        return require(name);
      }

      var end = function () {
        i++;
        if (i == resource.parts.length) {
          var r = window.document.innerHTML;
          if (hash) headers.etag = hash;
          resource.cacheResponse = 
            { headers: headers
            , string: r
            , buffer: new Buffer(r)
            , hash: hash
            }
          resource.respond(req, resp);
        }
      }

      resource.parts.forEach(function (part) {
        var n = window.document.getElementById(part.id);
        part.parent = n.parentNode;
        part.parent.removeChild(n);
      })
      resource.parts.forEach(function (part) {
        var exports = {};
        window.__exports = exports;
        window.setHeader = function (key, value) {
          headers[key] = value;
        }
        var cbopts = copy(window)
          , tc = new TimedCallback(cbopts, end)
          ;
        cbopts.partSource = part.src;
        cbopts.window = window;
        cbopts.message = "Timeout in jspp part.";
        evalcx('__exports.ret = function (end) {' + part.src + '}', window, resource.filename);
        exports.ret.apply(part.parent, [tc.finish]);
      })  
      if (resource.parts.length === 0) end(); 
    }
  }])
}

exports.Resource = Resource;
exports.HtmlResource = HtmlResource;

var extmap = 
  { '.html': HtmlResource
  , 'default': Resource
  }

exports.createResource = function (filename, url, callback) {
  new (extmap[path.extname(filename)] || extmap.default)(filename, url, callback)
}


