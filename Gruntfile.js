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
                {browserName: "internet explorer", version: "11"},
                {browserName: "internet explorer", version: "10"},
                {browserName: "internet explorer", version: "9"},
                {browserName: "internet explorer", version: "8"},
                {browserName: "chrome", version: "39"},
                {browserName: "chrome", version: "38"},
                {browserName: "firefox", version: "34"},
                {browserName: "firefox", version: "33"},
                {browserName: "safari", version: "7"},
                {browserName: "safari", version: "6"},
                {browserName: "safari", version: "5"},
                {browserName: "opera", version: "12"},
                // * Opera 13+ are not supported due to market share Sauce says
                // * Android 4 emulators of Sauce don't work properly
                // * Safari 8 and iOS 6-8 don't work properly but not sure
            ].forEach(function(browser) {
                // Group tests by browser to avoid the sauce issue skipping some tests
                if (!(browser.browserName in config)) {
                    config[browser.browserName] = {
                        options: {
                            urls: ["http://127.0.0.1:9000/testee.html?runner=sauce"],
                            build: process.env.TRAVIS_BUILD_NUMBER,
                            browsers: [],
                            "max-duration": 240
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
        // Thanks to https://github.com/gregrperkins/grunt-mocha-hack
        var uncaughtExceptionHandlers = process.listeners("uncaughtException");
        process.removeAllListeners("uncaughtException");
        http.createServer(function(req, res) {
            var urlObj = url.parse(req.url, true);
            var query = urlObj.query;
            switch (urlObj.pathname) {
            // Executed by the test runner
            case "/open":
                res.end();
                vibe.open(query.uri, {reconnect: false})
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
            var mocha = new Mocha().reporter("tap");
            delete require.cache[require.resolve("./node_modules/vibe-protocol/test/client.js")];
            mocha.addFile("./node_modules/vibe-protocol/test/client.js");
            // Set options through process.argv
            process.argv.push("--vibe.transports", "ws,httpstream,httplongpoll");
            mocha.loadFiles();
            // Undo the changes
            process.argv.splice(process.argv.indexOf("--vibe.transports"), 2);
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
            var mocha = new Mocha().reporter("tap");
            delete require.cache[require.resolve("./node_modules/vibe-protocol/test/client.js")];
            mocha.addFile("./node_modules/vibe-protocol/test/client.js");
            // Set options through process.argv
            process.argv.push("--vibe.session", session.id, "--vibe.transports", query.transports);
            mocha.loadFiles();
            // Undo the changes
            process.argv.splice(process.argv.indexOf("--vibe.session"), 4);
            var runDomain = domain.create();
            runDomain.run(function() {
                // An empty function is needed as of Mocha 2.1.0
                var runner = mocha.run(function() {});
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