var fs = require("fs"),
    url = require("url"),
    http = require("http"),
    httpProxy = require('http-proxy'),
    react = require("../../react");

http.globalAgent.maxSockets = Infinity;

var response,
    targetAddr,
    proxy = httpProxy.createProxyServer({});

// Workflow
// 1. Start this server
// 2. Open a browser and connect to http://localhost:9000/test.html
//    1. test.html?sameorigin for same-origin connections that will be proxied to the real server
//    2. test.html?crossorigin for cross-origin connections that will connect to the real server
// 3. Do test by mocha and watch the result
http.createServer(function(req, res) {
    var urlObj = url.parse(req.url, true);
    switch (urlObj.pathname) {
    // A kind of long polling used by the browser to listen to the server
    case "/listen":
        res.setHeader("cache-control", "no-cache, no-store, must-revalidate");
        res.setHeader("pragma", "no-cache");
        res.setHeader("expires", "0");
        response = res;
        break;
    // Tell the browser to connect to the server
    // It's called by the react server
    case "/open":
        targetAddr = urlObj.query.uri.replace("/react", "");
        urlObj.query.uri = "http://localhost:9000/react";
        response.end(JSON.stringify(urlObj.query));
        res.end();
        break;
    // Static assets
    case "/react.js":
        res.setHeader("content-type", "text/javascript");
        fs.readFile(__dirname + "../../../react.js", function(err, data) {
            if (err) {
                throw err;
            }
            res.end(data);
        });
        break;
    case "/test.html":
        res.setHeader("content-type", "text/html");
        fs.readFile(__dirname + "/test.html", function(err, data) {
            if (err) {
                throw err;
            }
            res.end(data);
        });
        break;
    default:
        break;
    }
})
// Delegate request under the uri of /react to the real react server 
.on("request", function(req, res) {
    var urlObj = url.parse(req.url);
    if (urlObj.pathname === "/react") {
        // Not sure what agent option does but it's needed
        proxy.web(req, res, {target: targetAddr, agent: http.globalAgent});
    }
})
.on("upgrade", function (req, socket, head) {
    var urlObj = url.parse(req.url);
    if (urlObj.pathname === "/react") {
        // Here agent option doesn't seem to be needed but just to be sure
        proxy.ws(req, socket, head, {target: targetAddr, agent: http.globalAgent});
    }
})
.listen(9000);