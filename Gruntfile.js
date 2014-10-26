var crypto = require("crypto");
var domain = require("domain");
var fs = require("fs");
var http = require("http");
var Mocha = require("mocha");
var url = require("url");
var vibe = require("./vibe");

http.globalAgent.maxSockets = Infinity;

module.exports = function(grunt) {
    grunt.initConfig({
        "saucelabs-mocha": (function() {
            var config = {};
            [
                // They fail rarely
                {browserName: "internet explorer", version: "11"},
                {browserName: "internet explorer", version: "10"},
                {browserName: "chrome", version: "37"},
                {browserName: "chrome", version: "36"},
                {browserName: "firefox", version: "31"},
                {browserName: "firefox", version: "30"},
                {browserName: "safari", version: "7"},
                {browserName: "safari", version: "6"},
                {browserName: "safari", version: "5"},

                // They fail in sauce VMs but maybe not in your VMs
                // * should not lose any event in an exchange of one hundred of event
                {browserName: "internet explorer", version: "9"},
                // * should not lose any event in an exchange of one hundred of event
                {browserName: "internet explorer", version: "8"},
                // longpolljsonp's exchange tests
                {browserName: "opera", version: "12"},
                
                // They fail certainly
                // * should not lose any event in an exchange of one hundred of event
                {browserName: "iphone", version: "7.0"},
                {browserName: "iphone", version: "6.0"},
                
                // * Internet Explorer 6 and 7 can't be tested because we don't use
                // sauce tunnel to run test correctly and can't use localhost and 127.0.0.1 
                // so that it's not possible to avoid the persistent connection limit per host
                // * Opera 13+ are not supported due to market share Sauce says
                // * Android 4 emulators of sauce don't work properly
            ].forEach(function(browser) {
                // Group tests by browser to avoid the sauce issue skipping some tests
                if (!(browser.browserName in config)) {
                    config[browser.browserName] = {
                        options: {
                            urls: ["http://127.0.0.1:9000/testee.html?runner=sauce"],
                            build: process.env.TRAVIS_BUILD_NUMBER,
                            browsers: [],
                            "max-duration": 360
                        }
                    };
                }
                config[browser.browserName].options.browsers.push(browser);
            });
            return config;
        })()
    });
    
    grunt.loadNpmTasks("grunt-saucelabs");
    
    grunt.registerTask("test-node", function() {
        var done = this.async();
        var sockets = [];
        // Thanks to https://github.com/gregrperkins/grunt-mocha-hack
        var uncaughtExceptionHandlers = process.listeners("uncaughtException");
        process.removeAllListeners("uncaughtException");
        
        // To populate sockets
        vibe.transports._base = vibe.transports.base;
        vibe.transports.base = function(socket, options) {
            socket.id = options.id;
            return vibe.transports._base.apply(this, arguments);
        };
        
        http.createServer(function(req, res) {
            var urlObj = url.parse(req.url, true);
            var query = urlObj.query;
            switch (urlObj.pathname) {
            // Executed by the test runner
            case "/open":
                res.end();
                vibe.open(query.uri, {reconnect: false})
                .on("open", function() {
                    sockets.push(this.id);
                })
                .on("close", function() {
                    sockets.splice(sockets.indexOf(socket.id), 1);
                })
                .on("abort", function() {
                    this.close();
                })
                .on("echo", function(data) {
                    this.send("echo", data);
                })
                .on("/reply/inbound", function(data, reply) {
                    switch (data.type) {
                    case "resolved":
                        reply.resolve(data.data);
                        break;
                    case "rejected":
                        reply.reject(data.data);
                        break;
                    }
                })
                .on("/reply/outbound", function(data) {
                    switch (data.type) {
                    case "resolved":
                        this.send("test", data.data, function(data) {
                            this.send("done", data);
                        });
                        break;
                    case "rejected":
                        this.send("test", data.data, null, function(data) {
                            this.send("done", data);
                        });
                        break;
                    }
                });
                break;
            case "/alive":
                res.end("" + (sockets.indexOf(query.id) !== -1));
                break;
            default:
                res.statusCode = 404;
                res.end();
                break;
            }
        })
        .on("close", function() {
            uncaughtExceptionHandlers.forEach(process.on.bind(process, "uncaughtException"));
        })
        .listen(9000, function() {
            var server = this;
            var mocha = new Mocha();
            delete require.cache[require.resolve("./node_modules/vibe-protocol/test/client.js")];
            mocha.addFile("./node_modules/vibe-protocol/test/client.js");
            // Set options through process.argv
            process.argv.push("--vibe.transports", "ws,sse,longpollajax", "--vibe.extension", "reply");
            mocha.loadFiles();
            // Undo the changes
            process.argv.splice(process.argv.indexOf("--vibe.transports"), 4);
            var runDomain = domain.create();
            runDomain.run(function() {
                var runner = mocha.run(function(failures) {
                    server.close(function() {
                        done(failures === 0);
                    });
                });
                runDomain.on("error", runner.uncaught.bind(runner));
            });
        });
    });
    // To test locally, type grunt test-browser:local and open a browser to
    // http://127.0.0.1:9000/testee.html
    grunt.registerTask("test-browser", function(local) {
        var done = this.async();
        // Test session helper for concurrent test
        var sessions = {
            instances: {},
            issue: function(query) {
                var first = true;
                var session = {
                    id: crypto.randomBytes(3).toString("hex"),
                    set: function(res) {
                        if (this.fn) {
                            this.fn(res);
                            delete this.fn;
                        } else {
                            this.res = res;
                            if (first) {
                                first = false;
                                runTest(this, query);
                            }
                        }
                    },
                    get: function(fn) {
                        if (this.res) {
                            fn(this.res);
                            delete this.res;
                        } else {
                            this.fn = fn;
                        }
                    }
                };
                this.instances[session.id] = session;
                return session;
            },
            find: function(id) {
                return this.instances[id];
            }
        };
        var runTest = function(session, query) {
            var mocha = new Mocha();
            delete require.cache[require.resolve("./node_modules/vibe-protocol/test/client.js")];
            mocha.addFile("./node_modules/vibe-protocol/test/client.js");
            // Set options through process.argv
            process.argv.push("--vibe.session", session.id, "--vibe.transports", query.transports, "--vibe.extension", "reply");
            mocha.loadFiles();
            // Undo the changes
            process.argv.splice(process.argv.indexOf("--vibe.session"), 6);
            var runDomain = domain.create();
            runDomain.run(function() {
                var runner = mocha.run();
                runDomain.on("error", runner.uncaught.bind(runner));
                // For integration with Sauce
                // https://github.com/axemclion/grunt-saucelabs#test-result-details-with-mocha
                var failedTests = [];
                runner.on("end", function() {
                    var mochaResults = runner.stats;
                    mochaResults.reports = failedTests;
                    session.get(function(res) {
                        res.end("end(" + JSON.stringify(JSON.stringify(mochaResults)) + ")");
                    });
                });
                runner.on("fail", function(test, err) {
                    function flattenTitles(test) {
                        var titles = [];
                        while (test.parent.title) {
                            titles.push(test.parent.title);
                            test = test.parent;
                        }
                        return titles.reverse();
                    }
                    failedTests.push({name: test.title, result: false, message: err.message, stack: err.stack, titles: flattenTitles(test)});
                });
            });
        };
        var closed = [];
        // Thanks to https://github.com/gregrperkins/grunt-mocha-hack
        var uncaughtExceptionHandlers = process.listeners("uncaughtException");
        process.removeAllListeners("uncaughtException");
        // Broker for testee.html and test suite
        http.createServer(function(req, res) {
            var urlObj = url.parse(req.url, true);
            var query = urlObj.query;
            switch (urlObj.pathname) {
            // Executed by testee.html
            // to start test
            case "/begin":
                var session = sessions.issue(query);
                res.setHeader("content-type", "text/javascript; utf-8");
                res.end("begin(" + JSON.stringify(JSON.stringify(session.id)) + ")");
                break;
            // to make a persistent connection waiting a message from /open
            case "/poll":
                res.setHeader("cache-control", "no-cache, no-store, must-revalidate");
                res.setHeader("pragma", "no-cache");
                res.setHeader("expires", "0");
                res.setHeader("content-type", "text/javascript; utf-8");
                sessions.find(query.session).set(res);
                break;
            // to notify a specific socket is closed
            case "/closed":
                res.setHeader("content-type", "text/javascript; utf-8");
                res.end();
                closed.push(query.id);
                break;
            // Executed by the test runner
            case "/open":
                res.end();
                var session = sessions.find(query.session);
                session.get(function(res) {
                    // Sauce prefers 127.0.0.1 to localhost for some reason
                    query.uri = query.uri.replace("localhost", "127.0.0.1") + "?session=" + session.id;
                    res.end("connect(" + JSON.stringify(JSON.stringify(query)) + ")");
                });
                break;
            case "/alive":
                res.end("" + (closed.indexOf(query.id) === -1));
                break;
            // Static assets
            case "/vibe.js":
                res.setHeader("content-type", "text/javascript; utf-8");
                fs.readFile("./vibe.js", function(err, data) {
                    if (err) {
                        throw err;
                    }
                    res.end(data);
                });
                break;
            case "/testee.html":
                res.setHeader("content-type", "text/html; utf-8");
                fs.readFile("./test/resources/testee.html", function(err, data) {
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
        .on("close", function() {
            uncaughtExceptionHandlers.forEach(process.on.bind(process, "uncaughtException"));
        })
        .listen(9000, function() {
            if (local !== "local") {
                done();
                grunt.task.run("saucelabs-mocha");
            }
        });
    });
    grunt.registerTask("test", ["test-node", "test-browser"]);
};