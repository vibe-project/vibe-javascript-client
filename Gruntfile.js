var url = require("url");
var fs = require("fs");
var http = require("http");
var react = require("./react");
var Mocha = require("mocha");

module.exports = function(grunt) {
    grunt.registerTask("test-node", function() {
        var done = this.async();
        
        http.createServer(function(req, res) {
            var urlObj = url.parse(req.url, true);
            switch (urlObj.pathname) {
            case "/open":
                var query = urlObj.query;
                react.open(query.uri, {
                    transports: [query.transport], 
                    heartbeat: +query.heartbeat || false, 
                    _heartbeat: +query._heartbeat || false, 
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
                break;
            default:
                res.statusCode = 404;
                res.end();
                break;
            }
        })
        .listen(9000, function() {
            var server = this;
            var mocha = new Mocha({grep: /ws|sse|longpollajax/});
            mocha.addFile("./node_modules/react-protocol/test/client.js");
            
            delete require.cache[require.resolve("./node_modules/react-protocol/test/client.js")];
            mocha.run(function(failures) {
                server.close(function() {
                    done(failures === 0);
                });
            });
        });
    });
    grunt.registerTask("test-browser", function() {
        var id = 0;
        var ress = {};
        var done = this.async();
        http.createServer(function(req, res) {
            res.setHeader("cache-control", "no-cache, no-store, must-revalidate");
            res.setHeader("pragma", "no-cache");
            res.setHeader("expires", "0");
            
            var urlObj = url.parse(req.url, true);
            switch (urlObj.pathname) {
            case "/start":
                var sid = "" + id++;
                process.env.REACT_TEST_SESSION_ID = sid;
                res.setHeader("content-type", "text/javascript; utf-8");
                res.end("poll(" + sid + ")");

                var mocha = new Mocha({grep: new RegExp(urlObj.query.transports), reporter: "spec"});
                mocha.addFile("./node_modules/react-protocol/test/client.js");
                
                delete require.cache[require.resolve("./node_modules/react-protocol/test/client.js")];
                mocha.loadFiles();
                
                function runMocha() {
                    var runner = mocha.run();
                    var failedTests = [];
                    runner.on("end", function() {
                        var mochaResults = runner.stats;
                        mochaResults.reports = failedTests;
                        ress[sid].end("setMochaResults(" + JSON.stringify(JSON.stringify(mochaResults)) + ")");
                    });
                    runner.on("fail", function(test, err) {
                        function flattenTitles(test) {
                            var titles = [];
                            while (test.parent.title) {
                                titles.push(test.parent.title);
                                test = test.parent;
                            }
                            return titles.reverse();
                        };
                        failedTests.push({name: test.title, result: false, message: err.message, stack: err.stack, titles: flattenTitles(test)});
                    });
                }
                
                (function iterate() {
                    setImmediate(function() {
                        if (sid in ress) {
                            runMocha();
                        } else {
                            iterate();
                        }
                    });
                })();
                break;
            case "/poll":
                res.setHeader("content-type", "text/javascript; utf-8");
                ress[urlObj.query.sid] = res;
                break;
            case "/open":
                (function iterate() {
                    setImmediate(function() {
                        if (urlObj.query.sid in ress) {
                            ress[urlObj.query.sid].end("connect(" + JSON.stringify(JSON.stringify(urlObj.query)) + ")");
                        } else {
                            iterate();
                        }
                    });
                })();
                res.end();
                break;
            case "/react.js":
                res.setHeader("content-type", "text/javascript; utf-8");
                fs.readFile("./react.js", function(err, data) {
                    if (err) {
                        throw err;
                    }
                    res.end(data);
                });
                break;
            case "/test.html":
                res.setHeader("content-type", "text/html; utf-8");
                fs.readFile("./test/testee/test.html", function(err, data) {
                    if (err) {
                        throw err;
                    }
                    res.end(data);
                });
                break;
            default:
                res.statusCode = 404;
                res.end();
                break;
            }
        })
        .listen(9000, function() {
//            done();
        });
    });
    grunt.registerTask("test", ["test-node"]);
};