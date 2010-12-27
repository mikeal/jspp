var fs = require('fs')
  , path = require('path')
  , style = fs.readFileSync(path.join(__dirname, 'static', 'error.css'))
  ;

function getRequestHtml (req, l) {
  if (l > 3) {
    try {
      return JSON.stringify(req);
    } catch(e) {
      return req.toString();
    }  
  }
  var html = ''
  for (i in req) {
    html += (
      '<div class="request-item">' +
        '<div class="request-key k'+l+'">' + i + '</div>'
    )
    if (typeof req[i] === "object") {
      html += '<div class="request-value">' + getRequestHtml(req[i], l+1) + '</div>'
    } else {
      html += '<div class="request-value">' + req[i] + '</div>'
    }
    html += '</div>'
    html += '<div class="spacer"></div>'
  }
  return html;
}

function getErrorHtml (err) {
  var html = '<div id="error">'
  for (i in err) {
    html += (
      '<div class="error-item">' +
        '<div class="error-key">' + i + '</div>' +
        '<div class="error-value">' + err[i] + '</div>' +
      '</div>'
    )
  }
  html += '</div>'
  return html;
}

function fileNotFound (req, resp) {
  resp.writeHead(404, {'content-type':'text/html'})
  resp.write('<html><head><title>File not found</title></head><body>404: File Not Found</body></html>');
  resp.end();
}

function onload () {
  var h = $('div.request-key').height();
  $('div.request-value').each(function (i, v) {
    var fullHeight = $(v).height();
    if (fullHeight > h) {
      $(v)
      .addClass('overweight')
      ;
    }
  })
  ;
  var reduction = function (elem) {
    $(elem).find('div.overweight')
    .each(function () {
      if ($(this).text !== '{...}') {
        var t = $(this).html();
        $(this)
        .text("{...}")
        .click(function () {
          $(this).html(t);
          reduction(this)
        })
        
      }
    })
    .css('cursor', 'pointer')
    ;
  }
  reduction(document);
  
}

function error (options) {
  var error = options.error || {}
    , h = error.msg || error.message || options.message || 'Unknown Error'
    ;
  options.response.writeHead(500, {'content-type':'text/html'});
  options.response.write(
    '<html>' +
      '<head>' + 
        '<title>Server Error</title>' +
        '<script src="/__jspp/jquery.js" type="text/javascript"></script>' +
      '</head>' +
      '<body>' +
        '<style type="text/css">'+style+'</style>'+
        '<div id="error-head">' + h + '</div>' +
        '<div id="error-exception">' + getErrorHtml(error) + '</div>' +
        '<div id="request">' +
          getRequestHtml(options.request, 0) +
        '</div>' +
        '<script type="text/javascript">$('+onload.toString()+');</script>' +
      '</body>' +
    '</html>'
  )
  console.log("returned error")
  options.response.end();
}

exports.fileNotFound = fileNotFound
exports.error = error