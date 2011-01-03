var jspp = require('../lib/main')
  , assert = require('assert')
  , path = require('path')
  , fs = require('fs')
  , request = require('request')
  ;

var port = 8888;
var expected = {};

function serve (cb) {
  jspp.createServer(path.join(__dirname, 'site'), function (s) {
    s.listen(port);
    console.log('Serving on '+port);
    if (cb) cb(s);
  }) 
}

function run () {
  expected['index.html'] = fs.readFileSync(path.join(__dirname, 'expected', 'index.html'));
  expected['test.css'] = fs.readFileSync(path.join(__dirname, 'expected', 'test.css'));
  
  serve(function (s) {
    var i = -1
      , doTest = function () {
        i++;
        if (i === tests.length) {
          s.close();
          console.log('tests finished');
          process.exit();
        } else {
          tests[i](doTest)
        }
      }
    doTest();
  })
}

function capture () {
  var stdout = process.stdout;
  var r = { text : ''}
  r.stop = function () {
    stdout.removeListener('data', r.start)
  }
  r.start = function () {
    stdout.on('data', function (chunk) {r.text += chunk;})
  }
  r.start();
  return r;
}

var base = 'http://localhost:'+port+'/'

function testIndex (end) {
  var c = capture();
  request({uri:base}, function (err, resp, body) {
    assert.ok(resp.statusCode == 200);
    assert.ok(body)
    assert.ok(body == expected['index.html'])
    // console.log(JSON.stringify(c.text))
    // assert.ok(c.text.indexOf('Test page') !== -1)
    // assert.ok(c.text.indexOf('should not') === -1)
    c.stop();
    c = capture();
    request({uri:base+'index.html'}, function (err, resp, body) {
      assert.ok(resp.statusCode == 200);
      assert.ok(body)
      assert.ok(body == expected['index.html'])
      // assert.ok(c.text.indexOf('Test page') !== -1)
      // assert.ok(c.text.indexOf('should not') === -1)
      c.stop();
      end();
    })
  })
}

function testCss (end) {
  request({uri:base+'test.css'}, function (err, resp, body) {
    assert.ok(resp.statusCode == 200);
    assert.ok(body)
    assert.ok(resp.headers['content-type'] == 'text/css')
    assert.ok(body == expected['test.css'])
    end();
  })
}

function testCache (end) {
  end()
}


var tests = [testIndex, testCss, testCache];

if (process.argv.indexOf('serve') === -1) run();
else serve()