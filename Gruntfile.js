var crypto = require("crypto");
var domain = require("domain");
var fs = require("fs");
var http = require("http");
var httpProxy = require("http-proxy");
var ip = require("ip");
var ipAddr = ip.address();
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
                {browserName: "chrome", version: "34"},
                {browserName: "chrome", version: "33"},
                {browserName: "firefox", version: "29"},
                {browserName: "firefox", version: "28"},
                {browserName: "safari", version: "7"},
                {browserName: "safari", version: "6"},
                {browserName: "safari", version: "5"},
                {browserName: "iphone", version: "7.0"},

                // They fail often in sauce VMs maybe not in your VMs
                // Failure in cross origin: 
                // * should not lose any event in an exchange of one hundred of event
                {browserName: "internet explorer", version: "9"},
                // Failure in same and cross origin: 
                // * should not lose any event in an exchange of one hundred of event
                {browserName: "internet explorer", version: "8"},
                
                // They fail certainly
                // Failure in same and cross origin: 
                // * should not lose any event in an exchange of one hundred of event
                {browserName: "iphone", version: "6.0"},
                
                // * Internet Explorer 6 and 7 can't be tested because we don't use
                // sauce tunnel to run test correctly and can't use localhost and 127.0.0.1 
                // so that it's not possible to avoid the persistent connection limit per host
                // * Opera 12 kills the server testing WebSocket https://github.com/einaros/ws/issues/246
                // * Opera 13+ are not supported due to market share Sauce says
                // * Android 4 emulators of sauce don't work properly
            ].forEach(function(browser) {
                // Group tests by browser to avoid the sauce issue skipping some tests
                if (!(browser.browserName in config)) {
                    config[browser.browserName] = {
                        options: {
                            // Disable Sauce connect
                            tunneled: false,
                            // Use a real ip address because Sauce connect doesn't work correctly 
                            urls: [
                                "http://" + ipAddr + ":9000/test.html?sameorigin", 
                                "http://" + ipAddr + ":9000/test.html?crossorigin"
                            ],
                            build: process.env.TRAVIS_BUILD_NUMBER,
                            browsers: [],
                            "max-duration": 240,
                            sauceConfig: {
                                "record-video": false, 
                                "record-screenshots": false, 
                                "video-upload-on-pass": false, 
                                "avoid-proxy": true
                            }
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
        
        http.createServer(function(req, res) {
            var urlObj = url.parse(req.url, true);
            switch (urlObj.pathname) {
            // Executed by the test runner
            case "/open":
                res.end();
                var query = urlObj.query;
                vibe.open(query.uri, {
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
                break;
            default:
                res.statusCode = 404;
                res.end();
                break;
            }
        })
        .listen(9000, function() {
            var server = this;
            var mocha = new Mocha({grep: /ws|sse|longpollajax/, reporter: "spec"});
            delete require.cache[require.resolve("./node_modules/vibe-protocol/test/client.js")];
            mocha.addFile("./node_modules/vibe-protocol/test/client.js");

            // From https://github.com/gregrperkins/grunt-mocha-hack
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
    grunt.registerTask("test-browser", function(local) {
        var done = this.async();
        // Test session helper
        var sessions = {
            instances: {},
            issue: function() {
                var session = {
                    id: crypto.randomBytes(3).toString("hex"),
                    // For proxy in testing same origin connection
                    address: null,
                    setResponse: function(res) {
                        if (this.fn) {
                            this.fn(res);
                            delete this.fn;
                        } else {
                            this.res = res;
                        }
                    },
                    response: function(fn) {
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
            find: function(sid) {
                return this.instances[sid];
            }
        };
        var proxy = httpProxy.createProxyServer({});
        
        http.createServer(function(req, res) {
            var urlObj = url.parse(req.url, true);
            switch (urlObj.pathname) {
            // Executed by test.html to start test
            case "/begin":
                var session = sessions.issue();
                res.setHeader("content-type", "text/javascript; utf-8");
                res.end("begin(" + JSON.stringify(JSON.stringify(session.id)) + ")");

                process.env.VIBE_TEST_SESSION_ID = session.id;
                var mocha = new Mocha({grep: new RegExp(urlObj.query.transports), reporter: "spec"});
                delete require.cache[require.resolve("./node_modules/vibe-protocol/test/client.js")];
                mocha.addFile("./node_modules/vibe-protocol/test/client.js");
                mocha.loadFiles();
                
                // From https://github.com/gregrperkins/grunt-mocha-hack
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
                        session.response(function(res) {
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
                        };
                        failedTests.push({name: test.title, result: false, message: err.message, stack: err.stack, titles: flattenTitles(test)});
                    });
                });
                break;
            // Executed by test.html to make a persistent connection waiting a message from /open
            case "/poll":
                res.setHeader("cache-control", "no-cache, no-store, must-revalidate");
                res.setHeader("pragma", "no-cache");
                res.setHeader("expires", "0");
                res.setHeader("content-type", "text/javascript; utf-8");
                sessions.find(urlObj.query.sid).setResponse(res);
                break;
            // Executed by the test runner
            case "/open":
                res.end();
                var session = sessions.find(urlObj.query.sid);
                session.address = urlObj.query.uri.replace("/vibe", "");
                session.response(function(res) {
                    // Intercept uri to replace localhost with the real ip
                    urlObj.query.uri = urlObj.query.uri.replace("localhost", ipAddr);
                    res.end("connect(" + JSON.stringify(JSON.stringify(urlObj.query)) + ")");
                });
                break;
            case "/vibe.js":
                res.setHeader("content-type", "text/javascript; utf-8");
                fs.readFile("./vibe.js", function(err, data) {
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
            // To test same origin connection
            case "/vibe":
                proxy.web(req, res, {target: sessions.find(urlObj.query.sid).address, agent: http.globalAgent}, function() {});
                break;
            default:
                res.statusCode = 404;
                res.end();
                break;
            }
        })
        .on("upgrade", function(req, socket, head) {
            var urlObj = url.parse(req.url, true);
            switch (urlObj.pathname) {
            // To test same origin connection
            case "/vibe":
                proxy.ws(req, socket, head, {target: sessions.find(urlObj.query.sid).address, agent: http.globalAgent}, function() {});
                break;
            }
        })
        .listen(9000, function() {
            if (local !== "local") {
                done();
                grunt.task.run("saucelabs-mocha");
            }
        });
    });
    grunt.registerTask("test", ["test-node"]);
};