var url = require("url"),
    http = require("http"),
    react = require("../../react");

http.globalAgent.maxSockets = Infinity;

http.createServer(function(req, res) {
    var urlObj = url.parse(req.url, true);
    if (urlObj.pathname === "/open") {
        // The following transports are not needed in Node.js
        switch (urlObj.query.transport) {
        case "streamxhr": case "streamxdr": case "streamiframe":
            urlObj.query.transport = "sse";
            break;
        case "longpollxdr": case "longpolljsonp":
            urlObj.query.transport = "longpollajax";
            break;
        }
        react.open(urlObj.query.uri, {
            transports: [urlObj.query.transport], 
            heartbeat: +urlObj.query.heartbeat || false, 
            _heartbeat: +urlObj.query._heartbeat || false, 
            reconnect: false, 
            notifyAbort: true
        })
        .on("abort", function() {
            this.close();
        })
        .on("echo", function(data) {
            this.send("echo", data);
        })
        .on("replyable", function(bool, reply) {
            if (bool) {
                reply.resolve(bool);
            } else {
                reply.reject(bool);
            }
        });
        res.end();
    }
})
.listen(9000);