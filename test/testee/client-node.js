var url = require("url"),
    http = require("http"),
    react = require("../../react"),
    sockets = {};

http.globalAgent.maxSockets = Infinity;

http.createServer(function(req, res) {
    var urlObj = url.parse(req.url, true);
    var params = urlObj.query;
    
    switch (urlObj.pathname) {
    case "/open":
        // The following transports are not needed in Node.js
        switch (params.transport) {
        case "streamxhr": case "streamxdr": case "streamiframe":
            params.transport = "sse";
            break;
        case "longpollxdr": case "longpolljsonp":
            params.transport = "longpollajax";
            break;
        }
        react.open(params.uri, {
            transports: [params.transport], 
            heartbeat: +params.heartbeat || false, 
            _heartbeat: +params._heartbeat || false, 
            reconnect: false, 
            notifyAbort: true})
        .on("open", function() {
            sockets[this.option("id")] = this;
        })
        .on("echo", function(data) {
            this.send("echo", data);
        })
        .on("reaction", function(bool, reply) {
            if (bool) {
                reply.resolve(bool);
            } else {
                reply.reject(bool);
            }
        });
        res.end();
        break;
    case "/close":
        sockets[params.id].close();
        res.end();
        break;
    default:
        break;
    }
})
.listen(9000);