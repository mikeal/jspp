var jspp = require('jspp')
  , path = require('path')
  ;
var bin = process.argv.shift()
  , filename = process.argv.shift()
  , command = process.argv.shift()
  , commands = {}
  ;
  
commands.serve = function () {
  var port = process.argv[1] || 8888;
  jspp.createServer(path.join(process.env.PWD, process.argv[0]), function (s) {
    s.listen(port);
    console.log('Serving on '+port);
  })
}
commands.help = function () {
  console.log(
    [ "jspp -- JavaScript Pre-Processor" 
    , ""
    , "Usage:"
    , "  jspp <command> [path] [port]"
    , ""
    , "Commands:"
    , "  serve  : Serve a given directory of content."
    ]
    .join('\n')
  )
  process.exit();
}

if (commands[command]) commands[command]();
else commands.help();